# ADR-0001: Repository Documentation Is the Project Memory

## Context

This project is large and will likely span many sessions and agents. Chat history can disappear or become inaccessible.

## Decision

All important discoveries, decisions, risks, and parity findings must be written into repository documentation under `docs/gzrender-v2/`.

## Alternatives Considered

- Keep context in chat only: rejected because it is fragile.
- One enormous prompt: rejected because it wastes model context and becomes hard to update.

## Consequences

Agents must update docs continuously. A new agent should be able to continue from repository docs alone.

## Parity Impact

Positive. Parity investigations and blockers become durable.

## Performance Impact

Small documentation overhead; large reduction in rediscovery work.
