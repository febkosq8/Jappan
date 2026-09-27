# Jappan Discord Bot Scratch Rework Plan (Feature Parity, JavaScript)

## Goal

Rebuild the bot from scratch in JavaScript with a cleaner architecture, better maintainability, and no feature loss.

## Hard Constraints

- Keep runtime language JavaScript.
- Preserve all current user-facing behavior unless explicitly approved to change.
- Preserve all operational/admin capabilities (including non-slash legacy flows) until explicitly deprecated.
- Preserve all persisted data semantics (MongoDB document meaning and migration safety).

## What Parity Means For This Rework

Parity in this project means functional parity, not code parity.

- Same capabilities remain available to users/admins.
- Same command and interaction surfaces remain available unless explicitly replaced with approved alternatives.
- Same data intent is preserved (guild config, playlists, logs), even if schemas are improved.
- Internal implementation can be modernized and cleaned up as long as no required capability is lost.

## Owner Scope Decisions (2026-06-18)

- v2 definition:
  - rebuild the codebase to the owner's current engineering standard.
  - primary objective is code quality, maintainability, and modern structure.
- v1 historical context:
  - original implementation was created during early JavaScript learning and includes experimental patterns/snippets.
- end-state functionality requirement:
  - end-user and admin functionality cannot be reduced or removed.

- Operational fallback commands are required because slash flows may be unavailable in some situations.
  - Decision: end-case operational fallback capability must exist when slash flows are unavailable.
  - Legacy commands may be kept or redesigned/replaced, but fallback coverage cannot be lost.
  - Exception rule: retire/replace only with owner sign-off and an equivalent supported mechanism.
- Data compatibility can use a controlled migration window.
  - Decision: allow migration during planned downtime for cutover.
- Architecture priorities for v2 are all high priority:
  - stability and uptime
  - code clarity and modularity
  - test coverage depth
  - performance improvements
  - observability/log quality
- Rollout model:
  - full test in new setup first
  - scheduled production downtime for migration/switchover
  - run required database migrations during downtime
  - switch traffic to v2 after migration validation
  - no hard downtime limit defined; migration window is quality-driven and explicitly planned.
- Improvement policy:
  - behavior and implementation improvements are encouraged
  - functionality must not be reduced
  - command response wording/UX text can improve as long as functional outcomes remain equivalent
  - adopt better Discord.js interaction/input UX patterns where beneficial
  - command UX may be improved broadly (inputs, affordances, and interaction flow) if functional outcomes are preserved
  - modular/reusable functions are preferred when logic is shared across multiple areas
  - avoid over-abstraction: do not split into separate functions/modules when reuse or clarity does not justify it

- Data model policy:
  - database schemas must be locked down in v2 (clear ownership, validation rules, and controlled evolution path).
  - keep schema enforcement pragmatic: rely on Mongoose schema definitions and reject invalid structure.

- Architecture inspiration:
  - implementation patterns may take inspiration from the owner's Node.js Express backend:
    - https://github.com/febkosq8/FebGoServe

- Sequencing preference:
  - migration planning/execution is an endgame concern after core architecture and feature reliability are in place.
  - startup order should be corrected to: DB readiness first, then Discord connection, then subsystem initialization.
  - global command deployment on startup is acceptable if implemented safely and idempotently.
  - architecture should remain shard-ready for future multi-instance deployments.

- Logging quality priority:
  - current logging quality is insufficient and must be significantly improved in v2.
  - logging content can be broad because access is host-restricted.
  - runtime sinks for v2: console + DB (PM2 handles file capture in production).

- Testing expectation:
  - implement practical test coverage for core functionality to validate regressions before cutover.
  - preferred test stack: Vitest.
  - acknowledge Discord.js testing limits and focus on practical core-behavior tests.

- Command contract flexibility:
  - slash command names/options may change in v2.
  - commands may be combined or split for better UX and maintainability.
  - this is an accepted breaking-change rework.
  - button interaction customId contracts/flows may also be redesigned in v2.

- Workspace boundary for v2 implementation:
  - all new implementation files must be created under rework/ only.
  - do not modify original v1 source files outside rework/ as part of this scratch rework.
  - rework/ may maintain its own package, env, lockfile, and project setup independent of v1.

## Current Setup Details Reference

Detailed current-state inventory has been moved to:

- rework/CURRENT_SETUP_DETAILS.md

Use that file as the source of truth for:

- command inventory
- event behavior inventory
- persistence fields
- runtime/dependency snapshot
- overlapping/legacy behavior mapping

## Feature-Group Summary (Condensed)

- User command surfaces: global slash, guild slash, button interactions, legacy prefix ops.
- Core systems: music runtime, leveling, moderation/warn, announcements, audit logging, utility/fun.
- Data systems: guild config, playlists, event/debug/error logs.
- Reliability systems: startup lifecycle, reconnect/disconnect handling, exception/rejection handling, graceful shutdown.

## Rework Encompass (In Scope)

- Full runtime and architecture rebuild in JavaScript.
- Refactor/rewrite to meet current owner coding standards.
- Full command and interaction surface parity.
- Interaction UX modernization using current Discord.js best-fit patterns.
- Command UX improvements across interaction flows while preserving functional parity.
- Legacy operational/admin fallback command support.
- Mongo data migration planning and execution for v2 cutover (endgame phase).
- Mongo schema hardening and lock-down (validation, invariants, and controlled change policy).
- Observability and reliability hardening with major logging quality uplift.
- Core-function test suite for parity and regression prevention.
- Independent v2 project scaffold and runtime under rework/.

## Priority Problems To Solve From v1 (Owner Confirmed)

### P1) DB disconnect instability causes unpredictable bot behavior

- Problem:
  - free-tier Atlas disconnects can cause unstable/random behavior in current architecture.
- v2 objective:
  - DB-dependent commands/events must fail gracefully when DB is unavailable.
- required behavior:
  - DB-dependent command/event paths are explicitly flagged and pre-checked against DB availability before execution.
  - if DB is unavailable, DB-dependent slash commands return a clear "service unavailable"-style response immediately.
  - bot process remains stable; non-DB-critical features keep running where possible.
  - no unbounded error cascades from DB outages.
  - log each blocked DB-dependent command attempt with command/user/guild context and DB-unavailable reason.
- acceptance criteria:
  - simulated DB outage does not crash process.
  - DB-required command path returns deterministic failure response.
  - recovery after DB reconnect is automatic or controlled and observable.
  - no retry-after-reply behavior is required for slash commands in DB-down state.

### P2) Logging quality is too poor for diagnosis

- Problem:
  - current logs are insufficient for troubleshooting production failures.
- v2 objective:
  - implement high-quality, structured, context-rich logging.
- required logging capabilities:
  - structured JSON logs.
  - correlation/request IDs across related events.
  - full error stack + contextual metadata.
  - persist critical logs to both DB and console sink.
- acceptance criteria:
  - production incident can be traced from command/event entry to failure using correlation ID.
  - error reports include stack and actionable context (guild, command, user, subsystem).

### P3) Architecture is fragile ("bandaids")

- Problem:
  - current structure is difficult to reason about and maintain.
- v2 objective:
  - modular, standards-aligned architecture with clear boundaries.
- acceptance criteria:
  - command handlers are thin and delegate to feature services.
  - cross-feature dependencies are explicit and limited.
  - new feature additions do not require editing unrelated modules.

### P4) Need core automated confidence checks

- Problem:
  - insufficient automated verification of core behavior.
- v2 objective:
  - add practical automated tests for highest-risk core functionality.
- first core tests (owner-directed):
  - guild list retrieval path.
  - song load path / music loading viability.
- acceptance criteria:
  - core test suite runs in CI/local and gates release readiness.
  - critical regressions in above flows are caught pre-cutover.

## Out of Scope (Unless Explicitly Added)

- Feature removals.
- Functional regressions relative to current production behavior.
- Non-JavaScript runtime migration.
- Unplanned breaking command contract changes.

## Rework Architecture (Target)

### A) Layers

1. Bootstrap Layer

- App startup, dependency wiring, config validation, lifecycle hooks.
- Startup orchestration order:
  - establish DB connectivity/readiness gate first.
  - connect/login Discord client second.
  - initialize sub-services after both prerequisites are healthy.
- Startup command deployment:
  - optional global deploy-on-start behavior behind explicit guard/config.
  - deploy path must be idempotent and safe for repeated boots.

2. Platform Layer

- Discord client adapters (events, interactions, command registration, presence).

3. Domain Layer

- Feature modules: music, moderation, leveling, announcements, audit, fun, utility, admin ops.

4. Infrastructure Layer

- Mongo repositories, logging sinks, external integrations, scheduler/timers.
- Multi-instance readiness:
  - design background tasks and deploy routines to be safe under potential sharding/multi-instance execution.
  - avoid assumptions of single-process ownership for distributed-sensitive operations.

5. Shared Utilities

- common validation, error wrappers, IDs/constants, response helpers.

### B) Module Boundaries

- commands/
  - slash/global, slash/guild, interactions/button, legacy/prefix
- features/
  - music/
  - moderation/
  - leveling/
  - announcements/
  - audit/
  - fun/
  - utility/
  - admin/
- domain/
  - services, policy logic, DTO-like structures
- infra/
  - db/, logging/, discord-player/, scheduling/
- app/
  - bootstrap, config, container wiring

### C) Design Rules

- No direct cross-feature imports without going through service interfaces.
- No command file should contain heavy business logic.
- Event listeners should be thin and delegate to feature services.
- All side effects should be explicitly logged via a unified logging interface.
- Extract shared logic into reusable functions/modules when used across multiple features.
- Keep feature-local logic local; avoid unnecessary helper proliferation.
- Optimize for readability and maintainability over maximal indirection.

## Migration Decision Framework (Apply To Every v1 Behavior)

For each migrated command/handler/path, apply this sequence before implementation:

1. Necessity check

- Is this behavior actually needed for required functionality?
- If not needed, propose deprecation/removal with owner sign-off.

2. Approach check

- Is the current v1 approach the best way to satisfy the requirement in v2?
- If no, redesign with a cleaner/safer pattern while preserving functional outcome.

3. Optimization check

- After necessity and approach are validated, optimize for reliability, clarity, and performance.
- Do not optimize in ways that reduce required functionality.

4. Record decision

- Document for each migrated area:
  - keep as-is behavior,
  - improve implementation,
  - or deprecate (owner-approved only).

## Parity Matrix (Must Pass Before Cutover)

### Command-Level Parity

- Existing capabilities remain available, but command names/options may be redesigned in v2.
- Button customId contracts may be redesigned in v2 as part of accepted breaking changes.
- Operational fallback capability must remain available even if specific legacy command names/paths are redesigned.

### Behavior-Level Parity

- Music queue lifecycle messages and controls behave equivalently.
- Leveling progression and role assignment semantics match existing behavior.
- Warn threshold actions (timeout/ban conditions) match current policy.
- Audit logging emits equivalent event classes.
- Announce and voice-region-lock workflows remain operational.

### Data-Level Parity

- Existing Mongo collections remain readable without destructive migration.
- Any schema evolution includes backward-compatible readers and migration scripts.
- User playlist and guild config data survive redeploy without manual fixes.
- v2 schema writes reject invalid/non-conforming payloads via Mongoose validation.

### Operational Parity

- Deploy flows, debug toggles, and shutdown behavior remain available.
- Runtime observability at least matches current error/debug/event coverage.

## Delivery Phases

### Phase 0: Freeze and Baseline

- Confirm final feature inventory with owner (this document).
- Capture current command signatures and customId contracts.
- Record env var contract and required secrets.

Exit Criteria:

- Signed-off inventory and parity matrix.

### Phase 1: Foundation

- Implement config loader + validation.
- Implement logger abstraction + sinks.
- Implement Discord app bootstrap and event router skeleton.
- Implement data access abstraction for Mongo.

Exit Criteria:

- Bot starts, connects, and passes health checks with no features yet.

### Phase 2: Command/Interaction Framework

- Implement command registry (global + guild).
- Implement interaction dispatcher and button router.
- Implement shared response/error handling.

Exit Criteria:

- Minimal commands execute end-to-end under new framework.

### Phase 3: Core Feature Migration (High Dependency)

- Music subsystem migration (player, queue messaging, controls, extractor behavior).
- Leveling subsystem migration (message + voice hooks, threshold behavior).
- Warn subsystem migration (threshold policy + actions + audit logging).

Exit Criteria:

- Core high-traffic features parity-tested.

### Phase 4: Remaining Feature Migration

- Announce, audit, voice-region-lock, doppelganger, soundboard, utility/help/admin.
- Legacy prefix operational commands migration or approved replacement.

Exit Criteria:

- Full feature matrix green in staging.

### Phase 5: Cutover and Stabilization

- Shadow run in staging.
- Controlled production rollout.
- Error budget monitoring and fast rollback path.

Exit Criteria:

- Stable production behavior and no critical parity regressions.

## Validation & Testing Strategy

### 1) Contract Tests

- Command input/output contracts for slash commands.
- Interaction customId routing contracts for buttons.

### 2) Scenario Tests

- End-to-end user scenarios per feature category:
  - music playback lifecycle
  - warn escalation lifecycle
  - leveling progression and role assignment
  - audit event emission coverage
  - announce and voice-region-lock behavior

### 3) Data Tests

- Read old documents and validate domain mapping.
- Non-destructive migration checks.

### 4) Operational Tests

- startup/shutdown, reconnect, exception handling, logging sinks.

## Risks and Mitigations

1. Hidden behavior in legacy paths

- Mitigation: keep legacy command handlers until parity replacement is approved.

2. Event-order and timing regressions (music/voice)

- Mitigation: scenario tests with deterministic test guild workflows.

3. Schema drift and implicit assumptions

- Mitigation: adapter layer and compatibility reads before schema hardening.

4. Interaction ID breakage

- Mitigation: treat customId redesign as a controlled migration with explicit mapping and validation tests.

## Immediate Next Inputs Needed From Owner

1. Business-critical commands/flows to prioritize first in migration order.
2. Exact behavior contracts that must remain unchanged (response wording, timing, thresholds, edge-case handling).
3. Migration downtime constraints (max window, preferred day/time, rollback deadline).
4. Approval on whether any operational command names can change while retaining equivalent capability.

## Change Policy For This Plan

- This file is the authoritative rework plan.
- Inventory and parity sections can be expanded as new facts arrive.
- No feature can move to "removed" without explicit owner approval recorded in this file.

## Documentation Certainty Policy

- Only confirmed facts and owner-approved decisions should be written to this file.
- Any unconfirmed item must remain in discussion until validated.
- When certainty is partial, record it explicitly as an assumption with a validation task.
- Scope and decision changes must include date and owner confirmation context.
- Clarification rule: when requirements are ambiguous, ask the owner directly and do not assume intent.

## Scope Fully Locked (2026-06-18)

- High-level rework scope and design constraints are owner-confirmed and locked.
- Future adjustments are treated as explicit scope changes and must be recorded with owner confirmation.
