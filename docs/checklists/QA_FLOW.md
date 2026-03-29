# QA Flow

Adapted from gstack's QA operating pattern and translated into a host-neutral checklist.

## Required pass

- Confirm the task appears in the dashboard after creation.
- Confirm the task transitions through `queued`, `running`, and `released` or `failed`.
- Confirm gate evidence is visible for the task.
- Confirm worker memory and sessions are queryable after execution.

## Recommended pass

- Exercise one invalid task payload and confirm the API rejects it.
- Confirm heartbeat timestamps update while the worker runtime is active.
- Confirm the budget and audit-event summaries change after task completion.

## Evidence

- Test result or demo output
- Screenshot or dashboard state
- Relevant task and worker IDs
