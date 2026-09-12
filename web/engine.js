/* RouteGuard browser engine: a faithful port of engine.py.
 *
 * engine.py remains canonical: the 17 automated tests and the 80-case benchmark
 * run against the Python implementation. This file exists so judges can open a
 * hosted page without installing Python. tools/conformance.mjs replays the
 * double-disruption scenario here and requires the resulting trace to equal the
 * committed submission/TechTitan_evidence_agentic.json, so the two cannot drift.
 *
 * No dependency, no CDN and no build step, matching the local application.
 */
(function (root) {
  'use strict';

  var LOT = 10;
  var SCENARIOS = {
    double_disruption: 'Two disruptions',
    normal: 'Stable recovery',
    tight_budget: 'Impossible budget',
    carbon_limit: 'Strict carbon limit',
    demand_surge: 'Demand increases'
  };

  function EngineError(message) {
    var e = new Error(message);
    e.name = 'EngineError';
    return e;
  }
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  var comma = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

  /* ---- Python-compatible helpers -------------------------------------- */

  // Reproduces json.dumps(obj, sort_keys=True) so receipt digests match Python.
  function pyJson(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(pyJson).join(', ') + ']';
    var keys = Object.keys(value).sort();
    return '{' + keys.map(function (k) {
      return JSON.stringify(k) + ': ' + pyJson(value[k]);
    }).join(', ') + '}';
  }

  // Synchronous SHA-256 (crypto.subtle is async; the engine is synchronous).
  function sha256Hex(str) {
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bytes = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0xd800 || c >= 0xe000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else {
        i++;
        c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
    var w = new Array(64), a, b, cc, d, e, f, g, h, t1, t2, j, off;
    var rotr = function (x, n) { return (x >>> n) | (x << (32 - n)); };
    for (off = 0; off < bytes.length; off += 64) {
      for (j = 0; j < 16; j++) {
        w[j] = (bytes[off + j * 4] << 24) | (bytes[off + j * 4 + 1] << 16) |
               (bytes[off + j * 4 + 2] << 8) | bytes[off + j * 4 + 3];
      }
      for (j = 16; j < 64; j++) {
        var s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        var s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      a = H[0]; b = H[1]; cc = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
      for (j = 0; j < 64; j++) {
        t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0;
        t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & cc) ^ (b & cc))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + cc) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  // Python tuple ordering, including nested tuples and length tie-breaks.
  function cmpTuple(x, y) {
    var n = Math.min(x.length, y.length);
    for (var i = 0; i < n; i++) {
      var c = Array.isArray(x[i]) ? cmpTuple(x[i], y[i]) : (x[i] < y[i] ? -1 : x[i] > y[i] ? 1 : 0);
      if (c !== 0) return c;
    }
    return x.length - y.length;
  }

  /* ---- Environment ------------------------------------------------------ */

  function initialWorld(scenario, goal) {
    scenario = scenario === undefined ? 'double_disruption' : scenario;
    if (!Object.prototype.hasOwnProperty.call(SCENARIOS, scenario)) throw EngineError('Unknown scenario');
    var g = { units: 100, budget: 14000, deadline: 24, carbon: 110 };
    if (scenario === 'tight_budget') g.budget = 4000;
    if (scenario === 'carbon_limit') g.carbon = 55;
    if (goal) {
      Object.keys(goal).forEach(function (k) { g[k] = goal[k]; });
    }
    var limits = { units: [10, 200], budget: [1, 100000], deadline: [1, 72], carbon: [1, 1000] };
    Object.keys(limits).forEach(function (key) {
      var v = g[key], lo = limits[key][0], hi = limits[key][1];
      if (typeof v === 'boolean' || typeof v !== 'number' || !Number.isInteger(v) || !(lo <= v && v <= hi)) {
        throw EngineError(key + ' must be an integer in [' + lo + ', ' + hi + ']');
      }
    });
    var got = Object.keys(g).sort().join(','), want = Object.keys(limits).sort().join(',');
    if (got !== want || g.units % LOT) {
      throw EngineError('Demand must be a multiple of 10; unknown goal fields are rejected');
    }
    // Cost/carbon are per lot. ETA is hours from scenario start.
    var offers = [
      { id: 'V1', name: 'Cuttack direct', kind: 'vendor', city: 'Cuttack', stock: 100, cost: 900, carbon: 9, eta: 8, available: true },
      { id: 'V2', name: 'Puri distributor', kind: 'vendor', city: 'Puri', stock: 60, cost: 1000, carbon: 8, eta: 14, available: true },
      { id: 'V3', name: 'Khordha warehouse', kind: 'transfer', city: 'Khordha', stock: 80, cost: 1150, carbon: 4, eta: 10, available: true },
      { id: 'V4', name: 'Berhampur rail', kind: 'vendor', city: 'Berhampur', stock: 100, cost: 1250, carbon: 3, eta: 22, available: true },
      { id: 'V5', name: 'Express air cargo', kind: 'vendor', city: 'Cargo hub', stock: 100, cost: 1550, carbon: 18, eta: 5, available: true }
    ];
    var initialStock = {};
    offers.forEach(function (o) { initialStock[o.id] = o.stock; });
    return {
      goal: g, scenario: scenario, offers: offers, initial_stock: initialStock,
      revision: 1, on_hand: 20, demand: g.units + 20,
      original_shipment: { id: 'S0', units: g.units, eta: 36, status: 'delayed' },
      orders: [], ledger: [], receipts: {}, faults: [], phase: 'observe', status: 'running',
      observation: null, catalog: null, plan: null, verification: null, replan_count: 0,
      steps: 0, last_error: null, baseline: null
    };
  }

  function totals(lines) {
    var etas = lines.map(function (x) { return x.eta; });
    return {
      units: lines.reduce(function (s, x) { return s + x.units; }, 0),
      cost: lines.reduce(function (s, x) { return s + Math.floor(x.units / LOT) * x.cost; }, 0),
      carbon: lines.reduce(function (s, x) { return s + Math.floor(x.units / LOT) * x.carbon; }, 0),
      eta: etas.length ? Math.max.apply(null, etas) : 0
    };
  }

  /* Complete finite search: lexicographically minimize cost, carbon, then ETA.
   * Constraints are hard filters. The search returns infeasibility, never
   * silently relaxes a budget, deadline, carbon cap or quantity requirement. */
  function optimize(catalog, goal, remaining) {
    var need = (remaining === undefined || remaining === null) ? goal.units : remaining;
    var active = catalog.filter(function (o) { return o.available && o.eta <= goal.deadline; });
    var best = null, examined = 0, feasible = 0;
    var rejected = { quantity: 0, budget: 0, carbon: 0 };
    // Each range is bounded by demand; enumeration is intentionally small and auditable.
    var sizes = active.map(function (o) { return Math.floor(Math.min(o.stock, need) / LOT) + 1; });
    var idx = active.map(function () { return 0; });
    var combos = sizes.reduce(function (a, b) { return a * b; }, 1);
    for (var c = 0; c < combos; c++) {
      examined++;
      var lots = idx.reduce(function (a, b) { return a + b; }, 0);
      if (lots * LOT !== need) {
        rejected.quantity++;
      } else {
        var lines = [];
        for (var i = 0; i < active.length; i++) {
          if (idx[i]) lines.push(Object.assign({}, active[i], { units: idx[i] * LOT }));
        }
        var t = totals(lines);
        if (t.cost > goal.budget) {
          rejected.budget++;
        } else if (t.carbon > goal.carbon) {
          rejected.carbon++;
        } else {
          feasible++;
          var score = [t.cost, t.carbon, t.eta, lines.map(function (x) { return x.units; })];
          if (best === null || cmpTuple(score, best.score) < 0) {
            best = { lines: lines, totals: t, score: score };
          }
        }
      }
      for (var k = idx.length - 1; k >= 0; k--) {           // itertools.product order
        if (++idx[k] < sizes[k]) break;
        idx[k] = 0;
      }
    }
    return {
      best: best, examined: examined, feasible: feasible, rejected: rejected,
      objective: 'Minimize cost, then carbon, then latest ETA; exact 10-unit lot search'
    };
  }

  function readEnvironment(w) {
    var valid = w.orders.filter(function (o) { return o.status === 'reserved' || o.status === 'delivered'; });
    var covered = valid.reduce(function (s, o) { return s + o.units; }, 0);
    return {
      revision: w.revision, demand: w.demand, on_hand: w.on_hand,
      missing: Math.max(0, w.demand - w.on_hand - covered),
      original_shipment: clone(w.original_shipment),
      committed: totals(valid), active_orders: clone(valid)
    };
  }

  /* Validate all lines before any mutation; receipt keys make retry idempotent. */
  function commitAllocation(w, plan, expectedRevision, key) {
    var digest = sha256Hex(pyJson(plan));
    if (Object.prototype.hasOwnProperty.call(w.receipts, key)) {
      var receipt = w.receipts[key];
      if (receipt.digest !== digest) return { ok: false, error: 'IDEMPOTENCY_CONFLICT' };
      return Object.assign({}, receipt, { replayed: true });
    }
    if (expectedRevision !== w.revision) {
      return { ok: false, error: 'STALE_REVISION', expected: expectedRevision, actual: w.revision };
    }
    var offers = {};
    w.offers.forEach(function (o) { offers[o.id] = o; });
    var lines = plan.lines || [];
    var unique = {};
    lines.forEach(function (x) { unique[x.id] = 1; });
    if (!lines.length || Object.keys(unique).length !== lines.length) {
      return { ok: false, error: 'INVALID_ALLOCATION' };
    }
    var trusted = [];
    for (var i = 0; i < lines.length; i++) {
      var o = offers[lines[i].id], n = lines[i].units;
      if (o === undefined || typeof n === 'boolean' || typeof n !== 'number' ||
          !Number.isInteger(n) || n <= 0 || n % LOT) {
        return { ok: false, error: 'INVALID_ALLOCATION' };
      }
      if (!o.available || o.stock < n) return { ok: false, error: 'CAPACITY_CHANGED' };
      trusted.push(Object.assign({}, o, { units: n }));
    }
    var existing = w.orders.filter(function (o) { return o.status === 'reserved'; });
    var combined = totals(existing.concat(trusted)), g = w.goal;
    if (combined.units !== g.units || combined.cost > g.budget ||
        combined.carbon > g.carbon || combined.eta > g.deadline) {
      return { ok: false, error: 'CONSTRAINT_VIOLATION' };
    }
    var ids = [];
    trusted.forEach(function (line) {
      var oid = 'R' + (w.orders.length + 1);
      offers[line.id].stock -= line.units;
      w.orders.push(Object.assign({}, line, { order_id: oid, status: 'reserved', reservation_key: key }));
      w.ledger.push({ order_id: oid, amount: Math.floor(line.units / LOT) * line.cost, kind: 'debit' });
      ids.push(oid);
    });
    w.revision += 1;
    var made = { ok: true, digest: digest, key: key, orders: ids, revision: w.revision, totals: totals(trusted) };
    w.receipts[key] = made;
    return made;
  }

  /* Sandbox closure: fully refundable pre-dispatch cancellation, no sunk emissions.
   * This is a disclosed simulator assumption, not a claim about physical shipments. */
  function closeOffer(w, offerId) {
    var offer = null;
    w.offers.forEach(function (o) { if (o.id === offerId && offer === null) offer = o; });
    if (offer === null) throw EngineError('Unknown route');
    offer.available = false;
    var cancelled = [];
    w.orders.forEach(function (order) {
      if (order.id === offerId && order.status === 'reserved') {
        order.status = 'cancelled';
        offer.stock += order.units;
        w.ledger.push({ order_id: order.order_id, amount: -Math.floor(order.units / LOT) * order.cost, kind: 'refund' });
        cancelled.push(order.order_id);
      }
    });
    w.revision += 1;
    w.verification = null;
    w.status = 'running';
    w.phase = 'observe';
    return { closed: offerId, cancelled: cancelled, revision: w.revision };
  }

  /* Independent state audit; ignores cached planner totals and success messages. */
  function verify(w) {
    var orders = w.orders.filter(function (o) { return o.status === 'reserved'; });
    var g = w.goal, t = totals(orders), byId = {};
    w.offers.forEach(function (o) { byId[o.id] = o; });
    var net = w.ledger.reduce(function (s, x) { return s + x.amount; }, 0);
    var orderIds = {};
    w.orders.forEach(function (o) { orderIds[o.order_id] = 1; });
    var checks = {
      quantity: t.units + w.on_hand === w.demand,
      budget: t.cost <= g.budget,
      carbon: t.carbon <= g.carbon,
      deadline: orders.every(function (o) { return o.eta <= g.deadline; }),
      routes_open: orders.every(function (o) { return byId[o.id].available; }),
      ledger_matches: net === t.cost,
      unique_orders: Object.keys(orderIds).length === w.orders.length,
      stock_conserved: w.offers.every(function (o) {
        var held = orders.reduce(function (s, x) { return x.id === o.id ? s + x.units : s; }, 0);
        return o.stock >= 0 && o.stock + held === w.initial_stock[o.id];
      }),
      trusted_prices: orders.every(function (o) {
        return o.cost === byId[o.id].cost && o.carbon === byId[o.id].carbon && o.eta === byId[o.id].eta;
      }),
      receipt_links: orders.every(function (o) {
        return Object.keys(w.receipts).some(function (k) { return w.receipts[k].orders.indexOf(o.order_id) !== -1; });
      })
    };
    return {
      ok: Object.keys(checks).every(function (k) { return checks[k]; }),
      checks: checks, totals: t, net_spend: net,
      scope: 'Verified reservations and simulated on-time inventory projection; physical delivery is not claimed'
    };
  }

  function makeEvent(kind, tool, title, detail, result) {
    return { kind: kind, tool: tool, title: title, detail: detail, result: result };
  }

  /* ---- Stores ----------------------------------------------------------- */

  function newId() {
    var s = '';
    for (var i = 0; i < 12; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
    return s;
  }

  // Mirrors Store in engine.py. The browser is single-threaded, so the SQLite
  // BEGIN IMMEDIATE transaction has no concurrent counterpart to guard against.
  function MemoryStore() { this.runs = {}; }
  MemoryStore.prototype.create = function (scenario, goal) {
    var rid = newId();
    this.runs[rid] = { world: initialWorld(scenario, goal), events: [] };
    return this.get(rid);
  };
  MemoryStore.prototype.load = function (rid) {
    if (!Object.prototype.hasOwnProperty.call(this.runs, rid)) throw EngineError('Run not found');
    return this.runs[rid];
  };
  MemoryStore.prototype.save = function (rid, record) { this.runs[rid] = record; };
  MemoryStore.prototype.get = function (rid) {
    var r = this.load(rid);
    return { id: rid, world: clone(r.world), events: clone(r.events) };
  };
  MemoryStore.prototype.mutate = function (rid, fn) {
    var r = this.load(rid), w = clone(r.world), events = clone(r.events);
    var event = fn(w);
    if (event) {
      event.seq = events.length + 1;
      event.timestamp = Date.now() / 1000;
      events.push(event);
    }
    this.save(rid, { world: w, events: events });
    return this.get(rid);
  };

  function LocalStore(prefix) {
    this.prefix = prefix || 'routeguard:run:';
  }
  LocalStore.prototype = Object.create(MemoryStore.prototype);
  LocalStore.prototype.constructor = LocalStore;
  LocalStore.prototype.load = function (rid) {
    var raw = null;
    try { raw = root.localStorage.getItem(this.prefix + rid); } catch (e) { raw = null; }
    if (!raw) throw EngineError('Run not found');
    return JSON.parse(raw);
  };
  LocalStore.prototype.save = function (rid, record) {
    try { root.localStorage.setItem(this.prefix + rid, JSON.stringify(record)); } catch (e) { /* private mode */ }
  };
  LocalStore.prototype.create = function (scenario, goal) {
    var rid = newId();
    this.save(rid, { world: initialWorld(scenario, goal), events: [] });
    return this.get(rid);
  };

  /* ---- Agent ------------------------------------------------------------ */

  /* Model-based policy: tool choice depends on persisted observations and
   * feedback. The controller reasons over explicit goals with finite action
   * search. It does not use an LLM or expose generated chain-of-thought. */
  function Agent(store) { this.store = store; }

  Agent.prototype.step = function (rid) {
    var self = this;
    return this.store.mutate(rid, function (w) { return self._step(w); });
  };

  Agent.prototype._step = function (w) {
    if (w.status !== 'running') return null;
    w.steps += 1;
    if (w.steps > 40) {
      w.status = 'escalated';
      return makeEvent('escalation', 'human.review', 'Step limit reached',
        'No unbounded retries; an operator must review the case.', {});
    }
    var phase = w.phase, g = w.goal;

    if (phase === 'observe') {
      var obs = readEnvironment(w);
      w.observation = obs;
      w.phase = obs.missing === 0 ? 'verify' : 'discover';
      return makeEvent('observation', 'inventory.read + shipment.read',
        obs.missing ? 'Service objective at risk' : 'Coverage restored; audit next',
        obs.missing + ' units still need coverage. Original shipment ETA is 36h; deadline is ' + g.deadline + 'h.',
        obs);
    }

    if (phase === 'discover') {
      w.catalog = clone(w.offers);
      w.catalog_revision = w.revision;
      w.phase = 'plan';
      return makeEvent('tool', 'vendor.list + route.lookup', 'Inspect recovery alternatives',
        'Read live capacity, route availability, cost, carbon and arrival estimates.', w.catalog);
    }

    if (phase === 'plan') {
      var committed = w.observation.committed;
      var residual = Object.assign({}, g, {
        budget: g.budget - committed.cost,
        carbon: g.carbon - committed.carbon
      });
      var result = optimize(w.catalog, residual, w.observation.missing);
      w.search = result;
      if (w.baseline === null || w.baseline === undefined) {
        w.baseline = Agent.baseline(w.catalog, residual, w.observation.missing);
      }
      if (result.best === null) {
        w.status = 'escalated';
        w.phase = 'done';
        return makeEvent('escalation', 'allocation.optimize', 'No feasible allocation',
          'Hard constraints cannot all be met. No new purchase is made; request an operator decision on budget, service target or suppliers.',
          result);
      }
      w.plan = result.best;
      w.phase = 'execute';
      return makeEvent('decision', 'allocation.optimize', 'Choose the least-cost feasible allocation',
        'Compared ' + comma(result.examined) + ' allocations; ' + result.feasible + ' feasible. Selected INR ' +
          comma(w.plan.totals.cost) + ' with ' + w.plan.totals.carbon + ' kg CO2e.',
        result);
    }

    if (phase === 'execute') {
      if (w.scenario === 'double_disruption' && w.faults.indexOf('race') === -1) {
        var target = w.plan.lines[0].id;
        w.faults.push('race');
        var feedback = closeOffer(w, target);
        // The agent still sends its old revision; the tool must reject it.
        w.phase = 'execute';
        return makeEvent('disruption', 'environment.close_route', 'Supplier withdrawn before commit',
          'The simulator changes availability after planning. The pending plan is now stale.', feedback);
      }
      var key = 'revision-' + w.catalog_revision;
      var committedResult = commitAllocation(w, w.plan, w.catalog_revision, key);
      if (!committedResult.ok) {
        w.replan_count += 1;
        w.last_error = committedResult.error;
        w.phase = 'observe';
        return makeEvent('adaptation', 'logistics.commit', 'Action rejected; refresh and replan',
          'The failed transaction made no purchase. The agent returns to observation using the tool error.',
          committedResult);
      }
      w.phase = 'verify';
      return makeEvent('action', 'logistics.commit', 'Recovery reservations committed',
        'Capacity and budget were checked again. Orders, inventory deductions, ledger entries and receipt were saved atomically.',
        committedResult);
    }

    if (phase === 'verify') {
      var v = verify(w);
      w.verification = v;
      if (!v.ok) {
        // Integrity failures require review, while coverage/route feedback can be replanned.
        var integrity = ['ledger_matches', 'stock_conserved', 'unique_orders', 'trusted_prices', 'receipt_links'];
        if (integrity.some(function (k) { return !v.checks[k]; })) {
          w.status = 'escalated';
          w.phase = 'done';
          return makeEvent('escalation', 'outcome.verify', 'Audit mismatch; operator review required',
            'The agent refuses to claim success when transactional evidence is inconsistent.', v);
        }
        w.replan_count += 1;
        w.phase = 'observe';
        return makeEvent('adaptation', 'outcome.verify', 'Verification failed; replan',
          'Observed environment does not satisfy the goal.', v);
      }
      if (w.scenario === 'double_disruption' && w.faults.indexOf('second') === -1) {
        w.phase = 'monitor';
      } else if (w.scenario === 'demand_surge' && w.faults.indexOf('surge') === -1) {
        w.phase = 'monitor';
      } else {
        w.status = 'verified';
        w.phase = 'done';
      }
      return makeEvent('verification', 'outcome.verify', 'All 10 independent checks passed',
        'Read back reservations, stock and ledger; recompute quantity, spend, carbon and deadline.', v);
    }

    if (phase === 'monitor') {
      if (w.scenario === 'double_disruption') {
        var active = w.orders.filter(function (o) { return o.status === 'reserved'; });
        var closed = closeOffer(w, active[0].id);
        w.faults.push('second');
        w.replan_count += 1;
        return makeEvent('disruption', 'shipment.monitor', 'Second disruption after reservation',
          'A reserved route closes before dispatch. Cancel affected orders, refund the simulated charge, preserve unaffected reservations, and recover the new shortfall.',
          closed);
      }
      w.faults.push('surge');
      w.goal.units += 20;
      w.demand += 20;
      w.revision += 1;
      w.verification = null;
      w.replan_count += 1;
      w.phase = 'observe';
      return makeEvent('disruption', 'demand.monitor', 'Demand increased by 20 units',
        'Keep existing reservations and plan only the incremental shortage under the original budget and carbon limits.',
        { demand: w.demand, goal: w.goal });
    }

    throw EngineError('Invalid controller state');
  };

  // Deliberately simple, disclosed baseline: cheapest eligible offer first;
  // it ignores the global carbon cap until post-checking its allocation.
  Agent.baseline = function (catalog, goal, need) {
    var remaining = need, lines = [];
    catalog.slice().sort(function (a, b) { return a.cost - b.cost; }).forEach(function (o) {
      if (!o.available || o.eta > goal.deadline) return;
      var n = Math.floor(Math.min(o.stock, remaining) / LOT) * LOT;
      if (n) { lines.push(Object.assign({}, o, { units: n })); remaining -= n; }
    });
    var t = totals(lines);
    return {
      totals: t,
      feasible: remaining === 0 && t.cost <= goal.budget && t.carbon <= goal.carbon,
      description: 'Cheapest-first allocation without global constraint search; no failure recovery'
    };
  };

  Agent.prototype.run = function (rid) {
    for (var i = 0; i < 45; i++) {
      var r = this.step(rid);
      if (r.world.status !== 'running') return r;
    }
    throw EngineError('Controller failed to terminate');
  };

  var RouteGuard = {
    LOT: LOT, SCENARIOS: SCENARIOS, initialWorld: initialWorld, totals: totals,
    optimize: optimize, readEnvironment: readEnvironment, commitAllocation: commitAllocation,
    closeOffer: closeOffer, verify: verify, event: makeEvent,
    MemoryStore: MemoryStore, LocalStore: LocalStore, Agent: Agent,
    pyJson: pyJson, sha256Hex: sha256Hex
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RouteGuard;
  root.RouteGuard = RouteGuard;
}(typeof globalThis !== 'undefined' ? globalThis : this));
