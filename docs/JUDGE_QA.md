# Technical Q&A

**Where is the AI if there is no LLM?**  
This is a classical symbolic, model-based planning agent: it represents a goal and environment state, searches actions under constraints, executes through tools and changes the plan from observations. We do not claim a language model. The published requirements focus on observable agentic behavior and leave architecture open. Our strongest evidence is the changed allocation and verified state after unforeseen tool feedback.

**Is this only a fixed workflow?**  
The controller has a finite policy, as most deployed agents do. The next tool and chosen allocation depend on shortage, tool errors, verification and updated constraints. It can complete, revisit observation, preserve existing reservations, or escalate. The demo fixtures cause known disruptions; judges can change budgets, deadlines, carbon limits and close any route independently. No final answer or allocation is replayed from a script.

**Why does the agent not simply choose the fastest supplier?**  
Delivery is a hard deadline. Among feasible allocations, the declared objective minimizes cost, then carbon, then latest ETA. Express cargo can miss budget/carbon constraints even when it is fast.

**Why not use real logistics data?**  
The task explicitly specifies a simulated logistics environment. Our data is original and disclosed, avoiding private ERP access and unsupported claims about real shipping/carbon values. Real data ingestion is an integration step, not evidence we claim to have.

**What stops a stale plan from overspending?**  
The commit tool checks the revision, re-reads authoritative offers, validates the complete combined allocation and mutates within a database transaction. A failed batch makes no partial purchase. Existing keys return their original receipt instead of charging again.

**Does verification prove the goods arrived?**  
No. It proves valid reservations and projected coverage within the simulation. Physical delivery confirmation and uncertain transit are outside this prototype.

**How fair is the benchmark?**  
All 80 inputs and the seed are included. An independent dynamic-programming implementation checks exact feasibility and the objective. A simple cheapest-first baseline is intentionally limited and disclosed. The 31 feasible cases and 49 infeasible cases are reported separately; we do not call infeasible cases failures or hide them.

**How does this scale?**  
The exact enumerator is practical only for the bounded small model. Production deployment needs a MILP/constraint solver, multiple SKUs/destinations, asynchronous tools, authentication, distributed transaction recovery and explicit sunk costs. We would retain the same observe/act/verify contract.

**What happens if no safe recovery exists?**  
The agent exposes the constraints and search result, keeps existing valid reservations and asks an operator to revise objectives or supply. It does not silently increase the budget or relax the deadline.

**What was the hardest engineering issue?**  
Making recovery update the world consistently rather than just changing a recommendation. Retained reservations reduce shortage and remaining resources; cancelled reservations release stock and reverse their ledger charge. Tests also caught a Windows database-connection cleanup issue, which was fixed by closing each connection explicitly.
