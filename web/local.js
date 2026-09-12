/* Serverless transport for the hosted preview.
 *
 * static/app.js normally calls the local Python server over fetch(). On GitHub
 * Pages there is no server, so this adapter answers the same four routes from
 * web/engine.js and keeps run state in localStorage. The request and response
 * shapes, and the error messages, match server.py so the UI code is unchanged.
 */
(function () {
  'use strict';

  var RG = window.RouteGuard;
  var store = new RG.LocalStore('routeguard:run:');
  var agent = new RG.Agent(store);

  function handle(path, body) {
    if (path === '/api/scenarios') return RG.SCENARIOS;

    if (path === '/api/runs' && body !== undefined) {
      return store.create(body.scenario === undefined ? 'double_disruption' : body.scenario, body.goal);
    }

    var parts = path.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'runs') {
      var rid = parts[2], action = parts[3];
      if (action === undefined) return store.get(rid);
      if (action === 'step') return agent.step(rid);
      if (action === 'run') return agent.run(rid);
      if (action === 'disrupt') {
        var oid = body && body.offer_id;
        return store.mutate(rid, function (w) {
          var result = RG.closeOffer(w, oid);
          w.replan_count += 1;
          return RG.event('disruption', 'operator.inject', 'Live route outage injected',
            'A judge can change any route; the controller must inspect the updated state.', result);
        });
      }
    }
    throw new Error('Not found');
  }

  window.RouteGuardLocal = function (path, body) {
    return new Promise(function (resolve, reject) {
      try {
        resolve(handle(path, body));
      } catch (err) {
        reject(new Error(err && err.message ? err.message : 'Request failed'));
      }
    });
  };
}());
