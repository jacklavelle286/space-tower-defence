import { LIMITS } from "./limits";

// YG1 (owner 2026-11-28): questions are grouped in bands, one per school year. Band = school year + firstBand (5):
// Reception 5, Year 1 6, Year 2 7 (the bands that were ages 5-7 before YG1), Year 3 8 ... Year 6 11 (Hard for Year 5).

/** The name of school year `index` (0 Reception, 1 Year 1, ...); past the contract's list, "Year n". */
export function yearName(index: number): string {
  return LIMITS.schoolYears.names[index] ?? `Year ${index}`;
}

/** The school year a question band belongs to, by name: 5 Reception, 6 Year 1, 7 Year 2, ... */
export function bandName(band: number): string {
  return yearName(band - LIMITS.schoolYears.firstBand);
}

/** A band range for a list or a heading: "Year 1" or "Year 1–Year 2". */
export function bandRangeName(low: number, high: number): string {
  return low === high ? bandName(low) : `${bandName(low)}–${bandName(high)}`;
}
