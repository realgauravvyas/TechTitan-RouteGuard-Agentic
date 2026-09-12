"""RouteGuard: goal-directed symbolic agent and transactional logistics sandbox.

No external service or model key is required. All quantities describe a simulation.
The search tool is exact for the finite, ten-unit lot model (not real logistics).
"""
from __future__ import annotations
import copy
import hashlib
import itertools
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOT = 10
SCENARIOS = {
    'double_disruption': 'Two disruptions',
    'normal': 'Stable recovery',
    'tight_budget': 'Impossible budget',
    'carbon_limit': 'Strict carbon limit',
    'demand_surge': 'Demand increases',
}

def initial_world(scenario='double_disruption', goal=None):
    if scenario not in SCENARIOS:
        raise ValueError('Unknown scenario')
    g = {'units': 100, 'budget': 14000, 'deadline': 24, 'carbon': 110}
    if scenario == 'tight_budget': g['budget'] = 4000
    if scenario == 'carbon_limit': g['carbon'] = 55
    if goal: g.update(goal)
    limits = {'units': (10, 200), 'budget': (1, 100000), 'deadline': (1, 72), 'carbon': (1, 1000)}
    for key, (low, high) in limits.items():
        value = g.get(key)
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise ValueError(f'{key} must be an integer in [{low}, {high}]')
    if set(g) != set(limits) or g['units'] % LOT:
        raise ValueError('Demand must be a multiple of 10; unknown goal fields are rejected')
    # Cost/carbon are per lot. ETA is hours from scenario start.
    offers = [
        dict(id='V1', name='Cuttack direct', kind='vendor', city='Cuttack', stock=100, cost=900, carbon=9, eta=8, available=True),
        dict(id='V2', name='Puri distributor', kind='vendor', city='Puri', stock=60, cost=1000, carbon=8, eta=14, available=True),
        dict(id='V3', name='Khordha warehouse', kind='transfer', city='Khordha', stock=80, cost=1150, carbon=4, eta=10, available=True),
        dict(id='V4', name='Berhampur rail', kind='vendor', city='Berhampur', stock=100, cost=1250, carbon=3, eta=22, available=True),
        dict(id='V5', name='Express air cargo', kind='vendor', city='Cargo hub', stock=100, cost=1550, carbon=18, eta=5, available=True),
    ]
    return dict(goal=g, scenario=scenario, offers=offers, initial_stock={o['id']:o['stock'] for o in offers},
                revision=1, on_hand=20, demand=g['units']+20,
                original_shipment={'id':'S0','units':g['units'],'eta':36,'status':'delayed'},
                orders=[], ledger=[], receipts={}, faults=[], phase='observe', status='running',
                observation=None, catalog=None, plan=None, verification=None, replan_count=0,
                steps=0, last_error=None, baseline=None)

def totals(lines):
    return {'units':sum(x['units'] for x in lines),
            'cost':sum(x['units']//LOT*x['cost'] for x in lines),
            'carbon':sum(x['units']//LOT*x['carbon'] for x in lines),
            'eta':max((x['eta'] for x in lines),default=0)}

def optimize(catalog, goal, remaining=None):
    """Complete finite search: lexicographically minimize cost, carbon, then ETA.

    Constraints are hard filters. The search returns infeasibility, never silently
    relaxes a budget, deadline, carbon cap or quantity requirement.
    """
    need = goal['units'] if remaining is None else remaining
    active = [o for o in catalog if o['available'] and o['eta'] <= goal['deadline']]
    best = None
    examined = feasible = 0
    rejected = {'quantity':0, 'budget':0, 'carbon':0}
    # Each range is bounded by demand; enumeration is intentionally small and auditable.
    ranges = [range(min(o['stock'],need)//LOT+1) for o in active]
    for allocation in itertools.product(*ranges):
        examined += 1
        if sum(allocation)*LOT != need:
            rejected['quantity'] += 1
            continue
        lines = [dict(o, units=n*LOT) for o,n in zip(active,allocation) if n]
        t = totals(lines)
        if t['cost'] > goal['budget']:
            rejected['budget'] += 1
            continue
        if t['carbon'] > goal['carbon']:
            rejected['carbon'] += 1
            continue
        feasible += 1
        score = (t['cost'],t['carbon'],t['eta'],tuple(x['units'] for x in lines))
        if best is None or score < best['score']:
            best = dict(lines=lines, totals=t, score=score)
    return dict(best=best, examined=examined, feasible=feasible, rejected=rejected,
                objective='Minimize cost, then carbon, then latest ETA; exact 10-unit lot search')

def read_environment(w):
    valid = [o for o in w['orders'] if o['status'] in ('reserved','delivered')]
    covered = sum(o['units'] for o in valid)
    return dict(revision=w['revision'], demand=w['demand'], on_hand=w['on_hand'],
                missing=max(0,w['demand']-w['on_hand']-covered),
                original_shipment=copy.deepcopy(w['original_shipment']),
                committed=totals(valid), active_orders=copy.deepcopy(valid))

def commit_allocation(w, plan, expected_revision, key):
    """Validate all lines before any mutation; receipt keys make retry idempotent."""
    digest = hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).hexdigest()
    if key in w['receipts']:
        receipt = w['receipts'][key]
        if receipt['digest'] != digest:
            return {'ok':False,'error':'IDEMPOTENCY_CONFLICT'}
        return dict(receipt, replayed=True)
    if expected_revision != w['revision']:
        return {'ok':False,'error':'STALE_REVISION','expected':expected_revision,'actual':w['revision']}
    offers = {o['id']:o for o in w['offers']}
    lines = plan.get('lines',[])
    if not lines or len({x['id'] for x in lines}) != len(lines):
        return {'ok':False,'error':'INVALID_ALLOCATION'}
    trusted=[]
    for line in lines:
        o=offers.get(line.get('id'))
        n=line.get('units')
        if o is None or isinstance(n,bool) or not isinstance(n,int) or n<=0 or n%LOT:
            return {'ok':False,'error':'INVALID_ALLOCATION'}
        if not o['available'] or o['stock'] < n:
            return {'ok':False,'error':'CAPACITY_CHANGED'}
        trusted.append(dict(o,units=n))
    existing = [o for o in w['orders'] if o['status']=='reserved']
    combined = totals(existing+trusted)
    g=w['goal']
    if (combined['units'] != g['units'] or combined['cost']>g['budget'] or
        combined['carbon']>g['carbon'] or combined['eta']>g['deadline']):
        return {'ok':False,'error':'CONSTRAINT_VIOLATION'}
    ids=[]
    for line in trusted:
        oid=f"R{len(w['orders'])+1}"
        offers[line['id']]['stock'] -= line['units']
        order=dict(line,order_id=oid,status='reserved',reservation_key=key)
        w['orders'].append(order)
        w['ledger'].append(dict(order_id=oid,amount=line['units']//LOT*line['cost'],kind='debit'))
        ids.append(oid)
    w['revision']+=1
    receipt=dict(ok=True,digest=digest,key=key,orders=ids,revision=w['revision'],totals=totals(trusted))
    w['receipts'][key]=receipt
    return receipt

def close_offer(w, offer_id):
    """Sandbox closure: fully refundable pre-dispatch cancellation, no sunk emissions.

    This is a disclosed simulator assumption, not a claim about physical shipments.
    """
    offer=next((o for o in w['offers'] if o['id']==offer_id),None)
    if offer is None: raise ValueError('Unknown route')
    offer['available']=False
    cancelled=[]
    for order in w['orders']:
        if order['id']==offer_id and order['status']=='reserved':
            order['status']='cancelled'
            offer['stock']+=order['units']
            w['ledger'].append(dict(order_id=order['order_id'],amount=-order['units']//LOT*order['cost'],kind='refund'))
            cancelled.append(order['order_id'])
    w['revision']+=1
    w['verification']=None
    w['status']='running'
    w['phase']='observe'
    return dict(closed=offer_id,cancelled=cancelled,revision=w['revision'])

def verify(w):
    """Independent state audit; ignores cached planner totals and success messages."""
    orders=[o for o in w['orders'] if o['status']=='reserved']
    g=w['goal']; t=totals(orders)
    by_id={o['id']:o for o in w['offers']}
    net=sum(x['amount'] for x in w['ledger'])
    checks={
        'quantity': t['units']+w['on_hand']==w['demand'],
        'budget': t['cost']<=g['budget'],
        'carbon': t['carbon']<=g['carbon'],
        'deadline': all(o['eta']<=g['deadline'] for o in orders),
        'routes_open': all(by_id[o['id']]['available'] for o in orders),
        'ledger_matches': net==t['cost'],
        'unique_orders': len({o['order_id'] for o in w['orders']})==len(w['orders']),
        'stock_conserved': all(o['stock']>=0 and o['stock']+sum(x['units'] for x in orders if x['id']==o['id'])==w['initial_stock'][o['id']] for o in w['offers']),
        'trusted_prices': all((o['cost'],o['carbon'],o['eta'])==(by_id[o['id']]['cost'],by_id[o['id']]['carbon'],by_id[o['id']]['eta']) for o in orders),
        'receipt_links': all(any(o['order_id'] in r['orders'] for r in w['receipts'].values()) for o in orders),
    }
    return dict(ok=all(checks.values()),checks=checks,totals=t,net_spend=net,
                scope='Verified reservations and simulated on-time inventory projection; physical delivery is not claimed')

class Store:
    def __init__(self,path=None):
        self.path=str(path or ROOT/'data'/'routeguard.sqlite3')
        Path(self.path).parent.mkdir(parents=True,exist_ok=True)
        with self.connect() as c:
            c.executescript('CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,world TEXT NOT NULL);'
                            'CREATE TABLE IF NOT EXISTS events(run_id TEXT,seq INTEGER,payload TEXT,PRIMARY KEY(run_id,seq));')
    @contextmanager
    def connect(self):
        c=sqlite3.connect(self.path,timeout=30)
        try:
            c.execute('PRAGMA journal_mode=WAL')
            with c:
                yield c
        finally:
            c.close()
    def create(self,scenario='double_disruption',goal=None):
        rid=uuid.uuid4().hex[:12];w=initial_world(scenario,goal)
        with self.connect() as c:
            c.execute('INSERT INTO runs VALUES(?,?)',(rid,json.dumps(w)))
        return self.get(rid)
    def get(self,rid):
        with self.connect() as c:
            row=c.execute('SELECT world FROM runs WHERE id=?',(rid,)).fetchone()
            if not row: raise KeyError('Run not found')
            events=[json.loads(x[0]) for x in c.execute('SELECT payload FROM events WHERE run_id=? ORDER BY seq',(rid,))]
        return dict(id=rid,world=json.loads(row[0]),events=events)
    def mutate(self,rid,fn):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT world FROM runs WHERE id=?',(rid,)).fetchone()
            if not row: raise KeyError('Run not found')
            w=json.loads(row[0]); event=fn(w)
            seq=c.execute('SELECT COUNT(*) FROM events WHERE run_id=?',(rid,)).fetchone()[0]+1
            if event:
                event.update(seq=seq,timestamp=time.time())
                c.execute('INSERT INTO events VALUES(?,?,?)',(rid,seq,json.dumps(event)))
            c.execute('UPDATE runs SET world=? WHERE id=?',(json.dumps(w),rid))
        return self.get(rid)

def event(kind,tool,title,detail,result):
    return dict(kind=kind,tool=tool,title=title,detail=detail,result=result)

class Agent:
    """Model-based policy: tool choice depends on persisted observations and feedback.

    The controller reasons over explicit goals with finite action search. It does
    not use an LLM or expose generated chain-of-thought as evidence.
    """
    def __init__(self,store): self.store=store
    def step(self,rid): return self.store.mutate(rid,self._step)
    def _step(self,w):
        if w['status']!='running': return None
        w['steps']+=1
        if w['steps']>40:
            w['status']='escalated'
            return event('escalation','human.review','Step limit reached','No unbounded retries; an operator must review the case.',{})
        phase=w['phase']; g=w['goal']
        if phase=='observe':
            obs=read_environment(w);w['observation']=obs
            if obs['missing']==0:
                w['phase']='verify'
            else:
                w['phase']='discover'
            return event('observation','inventory.read + shipment.read','Service objective at risk' if obs['missing'] else 'Coverage restored; audit next',
                         f"{obs['missing']} units still need coverage. Original shipment ETA is 36h; deadline is {g['deadline']}h.",obs)
        if phase=='discover':
            w['catalog']=copy.deepcopy(w['offers']);w['catalog_revision']=w['revision'];w['phase']='plan'
            return event('tool','vendor.list + route.lookup','Inspect recovery alternatives','Read live capacity, route availability, cost, carbon and arrival estimates.',w['catalog'])
        if phase=='plan':
            committed=w['observation']['committed']
            residual=dict(g,budget=g['budget']-committed['cost'],carbon=g['carbon']-committed['carbon'])
            result=optimize(w['catalog'],residual,w['observation']['missing']);w['search']=result
            if w['baseline'] is None:
                w['baseline']=self.baseline(w['catalog'],residual,w['observation']['missing'])
            if result['best'] is None:
                w['status']='escalated';w['phase']='done'
                return event('escalation','allocation.optimize','No feasible allocation','Hard constraints cannot all be met. No new purchase is made; request an operator decision on budget, service target or suppliers.',result)
            w['plan']=result['best'];w['phase']='execute'
            return event('decision','allocation.optimize','Choose the least-cost feasible allocation',
                         f"Compared {result['examined']:,} allocations; {result['feasible']} feasible. Selected INR {w['plan']['totals']['cost']:,} with {w['plan']['totals']['carbon']} kg CO2e.",result)
        if phase=='execute':
            if w['scenario']=='double_disruption' and 'race' not in w['faults']:
                target=w['plan']['lines'][0]['id'];w['faults'].append('race')
                feedback=close_offer(w,target)
                # The agent still sends its old revision; the tool must reject it.
                w['phase']='execute'
                return event('disruption','environment.close_route','Supplier withdrawn before commit','The simulator changes availability after planning. The pending plan is now stale.',feedback)
            key=f"revision-{w['catalog_revision']}"
            result=commit_allocation(w,w['plan'],w['catalog_revision'],key)
            if not result['ok']:
                w['replan_count']+=1;w['last_error']=result['error'];w['phase']='observe'
                return event('adaptation','logistics.commit','Action rejected; refresh and replan','The failed transaction made no purchase. The agent returns to observation using the tool error.',result)
            w['phase']='verify'
            return event('action','logistics.commit','Recovery reservations committed','Capacity and budget were checked again. Orders, inventory deductions, ledger entries and receipt were saved atomically.',result)
        if phase=='verify':
            v=verify(w);w['verification']=v
            if not v['ok']:
                # Integrity failures require review, while coverage/route feedback can be replanned.
                integrity=['ledger_matches','stock_conserved','unique_orders','trusted_prices','receipt_links']
                if any(not v['checks'][k] for k in integrity):
                    w['status']='escalated';w['phase']='done'
                    return event('escalation','outcome.verify','Audit mismatch; operator review required','The agent refuses to claim success when transactional evidence is inconsistent.',v)
                w['replan_count']+=1;w['phase']='observe'
                return event('adaptation','outcome.verify','Verification failed; replan','Observed environment does not satisfy the goal.',v)
            if w['scenario']=='double_disruption' and 'second' not in w['faults']:
                w['phase']='monitor'
            elif w['scenario']=='demand_surge' and 'surge' not in w['faults']:
                w['phase']='monitor'
            else:
                w['status']='verified';w['phase']='done'
            return event('verification','outcome.verify','All 10 independent checks passed','Read back reservations, stock and ledger; recompute quantity, spend, carbon and deadline.',v)
        if phase=='monitor':
            if w['scenario']=='double_disruption':
                active=[o for o in w['orders'] if o['status']=='reserved']
                target=active[0]['id'];result=close_offer(w,target);w['faults'].append('second');w['replan_count']+=1
                return event('disruption','shipment.monitor','Second disruption after reservation','A reserved route closes before dispatch. Cancel affected orders, refund the simulated charge, preserve unaffected reservations, and recover the new shortfall.',result)
            w['faults'].append('surge');w['goal']['units']+=20;w['demand']+=20;w['revision']+=1
            w['verification']=None;w['replan_count']+=1;w['phase']='observe'
            return event('disruption','demand.monitor','Demand increased by 20 units','Keep existing reservations and plan only the incremental shortage under the original budget and carbon limits.',{'demand':w['demand'],'goal':w['goal']})
        raise RuntimeError('Invalid controller state')
    @staticmethod
    def baseline(catalog,goal,need):
        # Deliberately simple, disclosed baseline: cheapest eligible offer first;
        # it ignores the global carbon cap until post-checking its allocation.
        remaining=need;lines=[]
        for o in sorted(catalog,key=lambda o:o['cost']):
            if not o['available'] or o['eta']>goal['deadline']: continue
            n=min(o['stock'],remaining);n=n//LOT*LOT
            if n: lines.append(dict(o,units=n));remaining-=n
        t=totals(lines)
        return dict(totals=t,feasible=remaining==0 and t['cost']<=goal['budget'] and t['carbon']<=goal['carbon'],
                    description='Cheapest-first allocation without global constraint search; no failure recovery')
    def run(self,rid):
        for _ in range(45):
            r=self.step(rid)
            if r['world']['status']!='running': return r
        raise RuntimeError('Controller failed to terminate')
