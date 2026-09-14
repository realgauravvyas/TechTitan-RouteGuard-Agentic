# RouteGuard

**TechTitan | Problem 6: Autonomous Retail Supply Chain Recovery Agent**  
Agentic AI Hackathon, Tech Zephyr 4.0, IIT Bhubaneswar

**Gaurav Vyas - Team leader**  
Utkarsh Umang - Member  
Shivam Salve - Member

RouteGuard pursues a retail service goal inside a transactional logistics sandbox. It monitors a delayed shipment, searches feasible supplier allocations, reserves inventory, observes failures, replans from fresh state and independently verifies the outcome. A browser console exposes every tool call and its evidence.

**Live demo:** [realgauravvyas.github.io/TechTitan-RouteGuard-Agentic](https://realgauravvyas.github.io/TechTitan-RouteGuard-Agentic/) - the same console, running entirely in your browser. Nothing to install.

## Run in one minute

Requires **Python 3.10 or newer** and a modern browser. No packages, keys, account, paid API or internet connection is required to run the app.

```sh
python server.py
```

Open **http://127.0.0.1:8765**. On Windows, you can also double-click `start.bat`. Keep its terminal open while using the app. If port 8765 is busy: `python server.py --port 8766` and open the corresponding address. Stop with Ctrl+C.

1. Keep **Two disruptions** selected and click **New scenario**.
2. Click **Run agent**, or **Single step** to inspect each transition.
3. Watch a supplier withdrawal invalidate the first plan, then a second outage cancel a committed reservation.
4. Inspect the final verification and click **Export evidence**.
5. Try **Strict carbon limit**, **Impossible budget**, or change the four constraints yourself. After a run, use **Inject live outage** for an unscripted perturbation, then continue the agent.

The default demo ends with 100 recovery units at INR 11,700, 38 kg CO2e and latest ETA 22 hours, within a budget of INR 14,000, a carbon cap of 110 kg and a deadline of 24 hours. There are 20 units already on hand and total store demand is 120. These are **simulated results**, not industry performance estimates.

## Reproduce the evidence

```sh
python -m unittest discover -s tests -v
python evaluate.py
python run_demo.py --scenario double_disruption --output submission/TechTitan_evidence_agentic.json
```

- 17 automated tests cover atomic actions, duplicate requests, stale snapshots, capacity failures, forged prices, stock/ledger tampering, restart recovery, concurrent steps, live outages and HTTP validation.
- The benchmark generates 80 synthetic cases using seed 1742838. An independently implemented dynamic-programming oracle checks feasibility and the cost/carbon/ETA objective.
- Results: 80/80 oracle agreement; all 31 feasible cases pass the state verifier; 49 infeasible cases are identified correctly. The cheapest-first baseline finds feasible allocations in 28 cases. This is a limited sandbox comparison, not a general advantage claim.

## Hosted demo and the browser engine

The hosted page exists so judges can inspect the agent without installing Python. `engine.py` remains canonical: the tests and the benchmark run against it. `web/engine.js` is a line-for-line port of it, and `web/local.js` answers the same four routes as `server.py` from browser storage, so the interface code in `static/` is shared by both builds and cannot drift.

The port is held to the Python implementation by an automated check:

```sh
node tools/conformance.mjs
```

It replays the demo through the browser engine and requires the result to equal `submission/TechTitan_evidence_agentic.json` event by event, including every SHA-256 receipt digest; it replays all five scenarios; and it re-runs all 80 benchmark cases, requiring identical allocations, identical search counts and identical baseline verdicts. GitHub Actions runs the Python tests and this check before publishing, so a diverging build cannot reach the demo URL.

## What makes this agentic

The controller is a **symbolic, model-based planning agent**, with exact finite action search. It is not an LLM chatbot. The rules do not require an LLM; they require goal pursuit, tool interaction, persistent state, feedback, adaptation and verification. We demonstrate those properties directly.

The next action depends on observations: missing coverage triggers retrieval and planning; a stale commit triggers fresh observation; an integrity failure escalates; successful verification completes the task. Actions change inventory, reservations and financial records. Goals can change while existing reservations are preserved. The demonstration's disruptions are scripted environment fixtures; allocation decisions and state changes are computed at runtime. Judges can inject different outages and constraints through the UI.

The controller policy is explicit and finite. It does not learn a policy or generate new tool code. Its exact optimizer is applicable only to the disclosed small model.

## Files

| File | Purpose |
|---|---|
| `engine.py` | Agent, exact optimization tool, sandbox mutations, verifier, SQLite persistence |
| `server.py` | Local HTTP endpoints and static app |
| `static/` | Browser console; no CDN or build step |
| `tests/test_engine.py` | Automated correctness and integration tests |
| `evaluate.py` | Seeded evaluation and independent oracle |
| `run_demo.py` | Command-line demo and evidence export |
| `docs/ARCHITECTURE.md` | Component diagram, contracts, objective and failure behavior |
| `web/engine.js` | Browser port of `engine.py` for the hosted demo |
| `web/local.js` | Serverless transport matching the `server.py` routes |
| `tools/conformance.mjs` | Proves the browser engine matches `engine.py` exactly |
| `tools/build_site.py` | Assembles the GitHub Pages build from `static/` and `web/` |

## Data and scope

All supply data is original synthetic data. Odisha place names are geographic labels only; no real supplier, route, freight price, carbon intensity or shipment is represented. Data provenance and assumptions are in `docs/DATA_CARD.md`. No medical/private dataset is needed.

The model has one SKU, one destination, five offers and indivisible ten-unit lots. Cancellation occurs before dispatch, releases all reserved stock, refunds the full charge and creates no sunk transport emissions. Time is a scenario-relative ETA snapshot; this prototype is not a wall-clock logistics simulator. Verification proves reservations and projected on-time coverage, not physical delivery. Production ERP integration, authentication, multi-SKU optimization, stochastic transit and partial/sunk costs are future work.

The Python server binds only to localhost and is intended for local judging, not public production hosting. The GitHub Pages demo is a separate static build that runs the agent in the browser: it has no server, makes no network calls after loading, and stores runs only in that browser, so nothing a visitor does leaves the page. Exported traces contain only synthetic operational data. `.env.example` is intentionally empty of credentials.

## Sources

- [Official Round 1 problem statements and rubric](https://docs.google.com/document/d/1GaCXe9AuFv0KCMPI8wj6FCPHt5AcPYjdIqhgAIIyByA/edit)
- [Competition and submission requirements](https://unstop.com/hackathons/agentic-ai-hackathon-tech-zephyr-40-indian-institute-of-technology-bhubaneswar-1742838/amp)

