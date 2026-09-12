"""Reproducible synthetic benchmark, seed 1742838; independent DP oracle."""
import copy
import json
import random
import statistics
import tempfile
import time
from pathlib import Path
from engine import Store, Agent, initial_world, optimize, commit_allocation, verify, SCENARIOS

def oracle(offers,g):
    # Independent dynamic programming: states are (quantity, carbon, latest ETA).
    # Retain minimum cost per state; no shared planner or totals implementation.
    states={(0,0,0):0}
    for o in offers:
        nxt={}
        for (q,c,h),price in states.items():
            cap=min(o['stock'],g['units']-q)//10 if o['available'] and o['eta']<=g['deadline'] else 0
            for n in range(cap+1):
                q2=q+10*n;c2=c+o['carbon']*n;p2=price+o['cost']*n;h2=max(h,o['eta']) if n else h
                if c2>g['carbon'] or p2>g['budget']:continue
                key=(q2,c2,h2);nxt[key]=min(nxt.get(key,10**12),p2)
        states=nxt
    valid=[(p,c,h) for (q,c,h),p in states.items() if q==g['units']]
    return min(valid) if valid else None

def evaluate():
    rng=random.Random(1742838);rows=[]
    for i in range(80):
        w=initial_world('normal');g=w['goal'];g.update(units=rng.choice([40,60,80,100]),budget=rng.randrange(4500,16001,500),carbon=rng.randrange(25,121,5),deadline=rng.choice([8,12,18,24]))
        w['demand']=g['units']+w['on_hand']
        for o in w['offers']:
            o.update(stock=rng.choice([20,40,60,80]),available=rng.random()>.20,cost=rng.randrange(700,1601,50),carbon=rng.randrange(2,16),eta=rng.choice([5,8,12,18,22,30]))
        w['initial_stock']={o['id']:o['stock'] for o in w['offers']}
        start=time.perf_counter();result=optimize(w['offers'],g);ms=(time.perf_counter()-start)*1000
        expected=oracle(w['offers'],g);best=result['best'];actual=tuple(best['totals'][k] for k in ['cost','carbon','eta']) if best else None
        assert actual==expected, (i,actual,expected)
        checks=None
        if best:
            assert commit_allocation(w,best,1,'evaluation')['ok'];checks=verify(w);assert checks['ok']
        # Baseline evaluated from the same pre-reservation snapshot.
        catalog=copy.deepcopy(w['offers'])
        for o in catalog:o['stock']=w['initial_stock'][o['id']]
        baseline=Agent.baseline(catalog,g,g['units'])
        rows.append(dict(case=i,goal=g,offers=catalog,oracle_feasible=expected is not None,planner_feasible=best is not None,
                         exact_objective_match=actual==expected,checks_passed=checks['ok'] if checks else None,
                         baseline_feasible=baseline['feasible'],planner_totals=best['totals'] if best else None,search_ms=round(ms,3),examined=result['examined']))
    scenarios=[]
    with tempfile.TemporaryDirectory() as td:
        s=Store(Path(td)/'eval.db')
        for name in SCENARIOS:
            r=Agent(s).run(s.create(name)['id']);w=r['world']
            scenarios.append(dict(scenario=name,status=w['status'],steps=w['steps'],replans=w['replan_count'],verification=w['verification']))
    feasible=[r for r in rows if r['oracle_feasible']]
    times=sorted(r['search_ms'] for r in rows)
    return dict(seed=1742838,data_type='Synthetic; generated test cases, not industry validation',model='5 offers, indivisible lots of 10, one SKU and destination',
                summary=dict(cases=len(rows),oracle_feasible=len(feasible),oracle_infeasible=len(rows)-len(feasible),
                             exact_matches=sum(r['exact_objective_match'] for r in rows),
                             verified_feasible=sum(r['checks_passed'] is True for r in rows),
                             greedy_feasible=sum(r['baseline_feasible'] for r in rows),
                             median_search_ms=round(statistics.median(times),3),p95_search_ms=times[int(len(times)*.95)-1]),
                scenarios=scenarios,cases=rows)

if __name__=='__main__':
    result=evaluate();out=Path(__file__).parent/'submission'/'TechTitan_evaluation_agentic.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result['summary'],indent=2));print(out)
