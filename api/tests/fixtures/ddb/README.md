# DynamoDB refusal shapes

What DynamoDB answers when a write is refused, reduced to what the handlers read (ADR-0021: these files start in
Phase 16, with the G7 create-run tests; Phase 17 adds the G5 ops shapes). Each file is one scenario of
[`api/tests/integration/test_g7_ddblocal.py`](../../integration/test_g7_ddblocal.py) or, for `g5-*`,
[`test_g5.py`](../../integration/test_g5.py):

| File | Scenario | What the handler does with it |
|---|---|---|
| `g7-session-held-elsewhere.json` | another device claims the lease between the handler's read and its transaction | reason 0 (SESSION) failed; its `Item` (ReturnValuesOnConditionCheckFailure = ALL_OLD) is a live lease → `409 ACTIVE_SESSION_ELSEWHERE` |
| `g7-run-exists.json` | a retry of the same create (same `runId`) wins the race | reason 1 (RUN) failed → the replay path, `200` with the stored run |
| `g7-profile-missing.json` | a whole-profile reset deletes PROFILE before the transaction | reason 2 (PROFILE ConditionCheck) failed → `404 PROFILE_NOT_FOUND` |
| `session-claim-refused.json` | R13 claim while another device holds a live lease | the UpdateItem error carries the old SESSION item → `409 ACTIVE_SESSION_ELSEWHERE` |
| `g5-fence-lost.json` | another device takes the lease between the ops handler's reads and its transaction | reason 0 (SESSION fence) failed → pause, re-read, step (b) → `STALE_SESSION` (409 when it is the first op) |
| `g5-revision-raced.json` | another writer moves the run on between the reads and the transaction | reason 1 (RUN `revision = :expected`) failed → pause, re-read, step (d) → `REJECTED STALE_REVISION` |
| `g5-duplicate-race.json` | the same resolving attempt lands first through another delivery | reasons 1 (RUN) and 2 (SLOT `status = UNRESOLVED`) failed → pause, re-read, step (a) → `ALREADY_APPLIED`; one reward |

The G5 rows (Phase 17) are scenarios of [`api/tests/integration/test_g5.py`](../../integration/test_g5.py). The ops
handler does not branch on the reasons: every cancellation goes back to step (a) with fresh reads (F §12.3), so the
files check that each race ends in the right answer, and `api/tests/unit/test_ops.py` feeds them to the handler. G5's
action order: 0 SESSION (ConditionCheck), 1 RUN, then SLOT, `SUM#` and PROFILE when the op needs them.

The G7 transaction's action order is fixed: 0 SESSION (the claim), 1 RUN, 2 PROFILE, then one Put per slot
([F §12.3](../../../../docs/plan/F-state-and-data.md#123-transaction-composition-and-action-counts)). `CancellationReasons`
come back in that order, which is how the handler tells the failures apart.

Normalised: the error `Code`; per reason its `Code` and, when present, `Item`; `Message` is dropped (free text that
differs between implementations and is never read).

How they are kept honest:

- `source` says where a file came from. The first versions were written locally from **moto 5.2.5**, through the same
  scenarios and normalisation, because DynamoDB Local does not run on the laptop. In CI (gate G-13) the `ddblocal`
  test runs each scenario against DynamoDB Local and compares. A difference fails CI and prints the observed JSON:
  read why it differs, then record it (`DDB_FIXTURES_RECORD=1` where DynamoDB Local runs) and change `source`.
- The unit tests (`api/tests/unit/test_runs.py`, `test_session.py`) feed these files to the handler on moto, so the
  classification is checked against the recorded shapes on every machine.
- DynamoDB Local may still differ from the real service (U-060); the real-table check is Phase 63.
