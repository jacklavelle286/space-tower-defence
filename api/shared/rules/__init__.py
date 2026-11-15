"""The rules: the reducer for the Milestone 1 ops, the next-phase rule, the contract validator, and the limits and
schemas read from contracts/ (Phase 12, M1-14).

Python mirror of web/game-core/src/rules/ (TypeScript name -> Python name):
  contracts.generated.ts  LIMITS, SCHEMAS                    -> contracts.py   LIMITS, SCHEMAS (read from the files)
  schema.ts               validate                           -> schema.py      validate
  next-phase.ts           slotIdFor, nextPhase, currentSlotId -> next_phase.py  slot_id_for, next_phase, current_slot_id
  reducer.ts              reduce                             -> reducer.py     reduce
contracts/fixtures/ is the specification both sides run (api/tests/unit/test_rules_fixtures.py).
"""

from shared.rules.contracts import LIMITS, SCHEMAS
from shared.rules.next_phase import current_slot_id, next_phase, slot_id_for
from shared.rules.reducer import reduce
from shared.rules.schema import validate

__all__ = ["LIMITS", "SCHEMAS", "current_slot_id", "next_phase", "reduce", "slot_id_for", "validate"]
