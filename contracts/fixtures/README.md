# Shared contract fixtures

One set of JSON files that says what the rules must do, read by every implementation
([I §I.2.3](../../docs/plan/I-validation.md#i23-shared-contract-fixtures-contracts)): Vitest runs them against the TypeScript
reducer and canonicaliser now (Phase 11), and pytest runs the same files against the Python mirror from Phase 12. A fixture is
written from the plan ([F §3](../../docs/plan/F-state-and-data.md#3-run-state-machine), [spine S3.2](../../docs/plan/00-spine.md#s32-operations-the-only-ways-run-state-changes)),
never copied from an implementation's output. Each file names the plan sections it comes from.

| Path | What | Read by |
|---|---|---|
| `ops/*.json` | op sequences: a starting run state, ops, and the expected result after each | `web/game-core/src/rules/reducer.test.ts` |
| `ops/matrix-*.json` | Phase 29: every cell of [F §3.5](../../docs/plan/F-state-and-data.md#35-full-phase--op-matrix)'s phase × op matrix, refusals included; a coverage test in each language fails on a missing cell | `reducer.test.ts`, `api/tests/unit/test_rules_fixtures.py` |
| `plausibility/vectors.json` | Phase 30: a synthetic bounds file, then (stored run, op) → the expected plausibility problems in order ([spine S6](../../docs/plan/00-spine.md#s6-plausibility-bounds-proposal-per-op-against-the-stored-snapshot)) | `web/game-core/src/rules/plausibility.test.ts`, `api/tests/unit/test_plausibility.py` |
| `next-phase.json` | `(slots, interval) → ACTIVITY \| METEOR \| BUILD`, and slot ID formatting | `web/game-core/src/rules/next-phase.test.ts` |
| `clipkey/vectors.json` | synthesis input → canonical JSON → clip key and object key (Phase 18, [ADR-0014](../../docs/decisions/0014-listening-bake-off.md)). The keys are computed, so the test re-derives each one with plain `json` + `hashlib`, independently of the spike code | `spikes/polly-listening/test_canonical.py`; `api/shared/clipkey.py`'s test from Phase 19 |
| `answers/vectors.json` | raw input → canonical answer or refusal (MULTIPLE_CHOICE so far), and answer shape vectors | `web/shared/src/learning/canonical.test.ts` |

## Op sequence format

```json
{
  "name": "file name without .json",
  "description": "the story, in words",
  "sources": ["plan sections"],
  "start": { "...": "a RunState (contracts/schemas/run-state.schema.json)" },
  "steps": [
    { "note": "why", "op": { "...": "an op (contracts/schemas/op.schema.json), or something deliberately invalid" },
      "expect": { "result": "APPLIED", "outcome": "INCORRECT", "attempt": {"n": 1, "...": "..."},
                  "state": { "revision": 4, "...": "only the top-level keys that change, each in full" },
                  "removed": ["phase", "snapshot"] } },
    { "op": { "...": "..." }, "expect": { "result": "REJECTED", "code": "PHASE_MISMATCH", "details": { "...": "..." } } },
    { "resend": 3, "expect": { "result": "ALREADY_APPLIED" } }
  ]
}
```

The release runs every file here through both implementations as gate G-3 (`.github/workflows/release.yml`, Phase 30).

A runner keeps an *expected state*, starting from `start`. For each step:

- `result`, `code`, `details`, `outcome` and `attempt` must equal the reducer's answer exactly; a key missing from `expect` must
  be missing from the answer too.
- `APPLIED`: the expected state becomes the previous expected state with each key of `state` replaced and each key in
  `removed` deleted, and the reducer's new state must equal it exactly (the whole state, not only the listed keys).
- `REJECTED`: the state does not change.
- `resend` (the index of an earlier step whose op is sent again) is for the handler runner (Phase 17), which has duplicate
  memory. The pure reducers have none, so they skip these steps (I §I.2.3).

## Rules a mirror must copy exactly

- **Check order** (from spine S7.1 without the server-only steps): the op's own fields → `RUN_TERMINAL` → `STALE_REVISION` →
  `PHASE_MISMATCH` → payload schema. A problem whose `field` starts with `op.payload.` belongs to the payload step; every
  other problem is an op-field problem and is reported first.
- **The phase step reads a payload field (`wave`, `slotId`) only when it has the right JSON type** (an integer; a string).
  A missing or wrongly typed field is left for the payload step, so it is `VALIDATION_FAILED`, not `PHASE_MISMATCH`.
- **Validation problems** are `{field, rule}` in the order given at the top of `web/game-core/src/rules/schema.ts`, each
  reported once. `rule` is the JSON Schema keyword. JSON Schema integers include `1.0`, and booleans are never numbers:
  in Python, check `bool` before `int`.
- **Patterns** must match the whole string with no trailing newline: in Python use `re.fullmatch` (or `\Z`), not `re.match`
  with `$`, which also matches before a final `\n` (the answer vectors include that case).
- Revision is +1 for every `APPLIED` op, including `NO_OP_VOIDED_SLOT`. A terminal run has no `phase` and no `snapshot`.
