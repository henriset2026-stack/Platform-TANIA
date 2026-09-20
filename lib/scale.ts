/**
 * SCALE — the Chapter DPS transformation narrative (CLAUDE.md §20).
 * Part of the TANIA dashboard identity, not decoration.
 */
export interface ScalePillar {
  readonly letter: string;
  readonly name: string;
}

export const SCALE: readonly ScalePillar[] = [
  { letter: "S", name: "Synergize" },
  { letter: "C", name: "Customer & Culture" },
  { letter: "A", name: "Automate" },
  { letter: "L", name: "Lead" },
  { letter: "E", name: "Expand" },
];
