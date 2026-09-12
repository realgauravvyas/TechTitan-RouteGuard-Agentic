# TechTitan demo narration and judging guide

The supplied video is an actual browser screen recording with computer-generated narration and visible chapter captions. Approximate duration: 4.21 minutes. All actions run against the local sandbox; no agent result is composited or fabricated.

## Narration

### 00:00 - TechTitan presents RouteGuard · Problem 6

This is RouteGuard, built for Problem Six, autonomous retail supply chain recovery. Team TechTitan is Gaurav Vyas, team leader, with Utkarsh Umang and Shivam Salve. This recording shows the working local application, using explicitly simulated logistics data.

### 00:17 - GOAL · 100 recovery units · INR 14,000 · 24 hours · 110 kg CO2e

Our store has twenty units on hand and needs one hundred more. The delayed original shipment arrives after the deadline. The agent must restore coverage within fourteen thousand rupees, twenty four hours, and one hundred ten kilograms of modeled carbon emissions.

### 00:32 - OBSERVE · Inspect inventory, delayed shipment and five recovery alternatives

The controller first reads inventory and shipment state, then retrieves available vendors and routes. Each offer has a real field in the simulator for capacity, cost, carbon and arrival time. These observations are saved, so later decisions use explicit evidence.

### 00:48 - DECIDE · Search all bounded allocations; choose the lowest-cost feasible plan

The planning tool searches ten unit lot allocations. Budget, carbon, capacity and deadline are hard constraints. Among feasible options, it minimizes cost, then carbon, then latest arrival. The first allocation reserves the Cuttack option at nine thousand rupees.

### 01:06 - UNEXPECTED CONDITION · Supplier becomes unavailable after planning

Now the environment changes between planning and execution. The supplier is withdrawn. This is a controlled fault in the demo environment, not a canned agent response. The pending plan still carries its old environment revision, so it cannot safely commit.

### 01:22 - ACTION FEEDBACK · Stale transaction rejected; no partial purchase

The reservation tool rejects the stale revision. No inventory is deducted and no payment is recorded. The agent observes this error and chooses to refresh its information and replan, instead of repeating the same failed transaction or merely describing a workaround.

### 01:38 - ADAPT · Fresh inventory leads to a different allocation

Fresh observations remove the unavailable supplier. The agent now selects sixty units from Puri and forty from Khordha. The allocation changes because the environment changed. It remains within the original limits, with ten thousand six hundred rupees of committed cost.

### 01:54 - ACT + VERIFY · Orders, stock, ledger and receipts agree

The commit tool creates reservations, deducts inventory, records charges and saves a receipt atomically. Verification then reads back the state and checks ten conditions. This is a state changing tool interaction, followed by evidence based verification, rather than a generated recommendation.

### 02:11 - SECOND DISRUPTION · Reserved Puri route closes before dispatch

A second disruption occurs after the first recovery is committed. The Puri route closes before dispatch. Its affected reservation is cancelled, its stock is released and the simulated charge is refunded. The valid forty unit Khordha reservation remains in place.

### 02:28 - REPLAN · Preserve valid orders; recover only the 60-unit shortfall

The agent reads the new shortfall and subtracts existing commitments from the remaining budget and carbon allowance. It searches only for the sixty missing units. The chosen recovery adds forty more units from Khordha and twenty units using the Berhampur option.

### 02:42 - FINAL OUTCOME · 100 units · INR 11,700 · 38 kg CO2e · 22 hours

The final reservation succeeds. Total coverage is one hundred recovery units at eleven thousand seven hundred rupees, with thirty eight kilograms of modeled carbon and a latest arrival of twenty two hours. Both disruptions have been handled while every original service constraint remains satisfied.

### 03:00 - VERIFY · Ten checks computed independently of cached planner claims

Here are the ten final checks, including ledger reconciliation, stock conservation, source prices and receipt links. Verified means the reservations satisfy our simulated objective. It does not claim that physical goods arrived, or that these fictional carbon values represent real measurements.

### 03:17 - PERSIST · Reload retains the same run, events and verified outcome

Reloading the browser retains the run and its complete history. SQLite saves each state transition together with its event. A restarted controller can continue from the saved state. Judges can also inject a different route outage or change constraints through the console.

### 03:33 - ROBUSTNESS · Impossible budget escalates without a purchase

For a second check, we set an impossible budget of four thousand rupees. The agent cannot find a feasible allocation and escalates for operator review. It does not invent success, secretly relax the budget, or issue an invalid purchase just to finish the workflow.

### 03:50 - EVIDENCE · 17 tests · 80 oracle comparisons · Runnable without keys

The package includes seventeen passing tests and eighty generated cases checked against an independent dynamic programming solver. All thirty one feasible cases verify; forty nine infeasible cases are identified. RouteGuard is a transparent symbolic planning agent. Source code, setup instructions, presentation and evidence are included. Thank you.

## Live judging follow-up

Start the app, choose a new scenario, and edit a constraint before running. Use Strict carbon limit to show a different feasible allocation. Use Impossible budget to show escalation. After successful recovery, inject an available route outage and let the agent replan. Use Single step to inspect tool outputs and Export evidence to preserve the run.

The video uses the same single-step execution endpoint as automatic mode to give viewers time to inspect decisions. The agent chooses each action; the recording only controls pacing. No human chooses the allocation.