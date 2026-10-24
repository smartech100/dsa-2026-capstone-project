# AI Log

- **Prompt:** I asked an AI tool to implement Build 1 of the Event Ticketing capstone in plain JavaScript, following `README.md` and `docs/build-1.md`, including domain errors, IDs, a linked-list FIFO queue, inventory and booking rules, a demo, and a lookup benchmark.
- **Result:** The AI created the requested domain modules, demo, benchmark, and `package.json` scripts. The demo ran and showed a sold-out booking being refused, two waitlist entries, reference lookup, cancellation, and the next person in line; the benchmark showed `Map.get` faster than `Array.find` in this run.
- **Review / changes:** The initial demo and benchmark smoke checks passed, so I did not make a follow-up code correction based on those checks. I still need to review the code and test edge cases (including invalid inputs and cancelling twice) before considering Build 1 fully verified.
