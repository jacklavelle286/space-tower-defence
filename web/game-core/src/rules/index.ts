// The rules: the reducer for the Milestone 1 ops, the next-phase rule, the contract validator, and the types and
// limits generated from contracts/ (Phase 11).
export * from "./contracts.generated";
export { currentSlotId, nextPhase, slotIdFor, type BetweenWavesPhase } from "./next-phase";
export { grantPowerCharge, reduce, type Applied, type Rejected, type ReduceResult } from "./reducer";
export { validate } from "./schema";
