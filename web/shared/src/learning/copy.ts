// Every child-facing line of the learning panel (D6.4, D6.5), in one place. The panel lives in web/shared because the
// admin preview-solve shows the same component (E.5.1), so its words live here too; the player's copy file
// (web/player/src/copy/en-GB.ts) re-exports them so the owner can still read all the player's words in one file.
// Lines marked [PROPOSAL] are not in the plan's tables yet.

export const PANEL_COPY = {
  play: "Play",
  playAgain: "Play again",
  stop: "Stop",
  loading: "Getting the sound ready…", // D6.5 Loading
  soundFailed: "We couldn't get the sound.", // D6.5 Failed, D7.3 SPEECH_UNAVAILABLE
  tryAgain: "Try again",
  readToMe: "Read it to me", // D6.1 (the instruction clip)
  check: "Check",
  checking: "Checking…", // D6.2 online-only durability
  triesLeft: (n: number) => `Tries left: ${n}`, // D6.4
  tried: "tried", // D1 rule 7, D6.2
  chooseFirst: "Choose an answer first.", // D6.4
  playFirst: "Press Play to listen first.", // D6.4
  notQuite: "Not quite. Have another go.", // D6.4
  correct: "You got it!", // D6.4
  rewardCredits: (n: number) => `+${n} space credits`, // D6.4 reward line
  rewardPower: (name: string) => `${name} is ready!`, // D6.4 reward line
  rewardPowerFull: (name: string, cap: number) => `You got it! ${name} is already full, so it stays at ${cap}.`, // D6.4, P8
  failed: "Good try. No credits this time — you can keep playing.", // D6.4 third incorrect
  answerWas: "The answer was", // D6.4 "The answer was …" (the answer follows in the reading font)
  voided: "This one had a mistake, so we took it away. You still get your reward.", // D6.4 voided
  notSaved: "That didn't save. Press Check again.", // D6.4
  continue: "Continue",
  saveAndExit: "Save and exit",
  optionLabel: (n: number, text: string) => `${n}: ${text}`, // [PROPOSAL] screen-reader name of an option
  triedName: (name: string) => `${name}, tried`, // [PROPOSAL] "2: s, tried", "8, tried"

  // Phase 38: object move, arrange, typed and two-step (D6.3, D6.4).
  fillFirst: "Fill every space first.", // D6.4
  moveFirst: "Move them first.", // D6.4
  typeFirst: "Type your answer first.", // D6.4
  triedThat: "You've tried that one. Have another go.", // D6.2, D6.4
  triedList: (answers: readonly string[]) => `Tried: ${answers.join(", ")}`, // D6.3 "Tried: cta"
  partLabel: (n: number) => `Part ${n}`, // [PROPOSAL] two-step: each part's heading when it has no question of its own
  partRight: "This part is right.", // [PROPOSAL] C20.3: a right part is locked with a tick
  partAgain: "Try this part again.", // D6.3, C20.3
  // OBJECT_MOVE share/count. The count is said, never shown as a numeral, so counting stays counting (D6.3).
  stillToMove: "Still to move", // [PROPOSAL] the tray's name
  zoneName: (label: string, n: number) => `${label}, has ${n}`, // [PROPOSAL]
  zoneHint: "Plus or Enter puts one in. Minus or Backspace takes one out.", // [PROPOSAL] D6.3 keys
  trayObject: (alt: string) => `${alt}, still to move`, // [PROPOSAL]
  placedObject: (alt: string, zone: string) => `${alt} in ${zone}, take it out`, // [PROPOSAL]
  movedIn: (zone: string, n: number) => `One put in ${zone}. ${zone} has ${n}.`, // [PROPOSAL] D6.3 announcement
  movedOut: (zone: string, n: number) => `One taken out of ${zone}. ${zone} has ${n}.`, // [PROPOSAL]
  noneLeft: "There are none left to move.", // [PROPOSAL]
  chooseWhere: "Now choose where it goes.", // [PROPOSAL] after lifting with several zones or bins
  // OBJECT_MOVE sort.
  stillToSort: "Still to sort", // [PROPOSAL] the tray's name
  notSorted: "not sorted yet", // [PROPOSAL]
  sortObjectName: (name: string, where: string) => `${name}, ${where}`, // [PROPOSAL] "sea, like tree"
  binDrop: (label: string) => `Put in ${label}`, // [PROPOSAL]
  trayDrop: "Back to the start", // [PROPOSAL] sends a lifted object back to the tray
  sortedInto: (name: string, bin: string) => `${name} put in ${bin}.`, // [PROPOSAL]
  backToTray: (name: string) => `${name} is back with the others.`, // [PROPOSAL]
  liftedObject: (name: string) => `${name} picked up. Choose a group, then press Enter.`, // [PROPOSAL] D6.3 keys
  dropCancelled: "Put back where it was.", // [PROPOSAL] Esc
  // ARRANGE.
  spacesLabel: "Spaces", // [PROPOSAL]
  tilesLabel: "Tiles", // [PROPOSAL]
  space: (n: number, of: number, text: string | null) => (text === null ? `Space ${n} of ${of}, empty` : `Space ${n} of ${of}: ${text}`), // [PROPOSAL]
  placed: (text: string, n: number, of: number) => `${text} placed in space ${n} of ${of}.`, // D6.3 "c placed in space 1 of 3"
  removed: (text: string) => `${text} back with the tiles.`, // [PROPOSAL]
  liftedTile: (text: string) => `${text} picked up. Left and Right move it. Enter puts it down.`, // [PROPOSAL] D6.3 keys
  movedTile: (text: string, n: number) => `${text} now in space ${n}.`, // [PROPOSAL]
  // TYPED.
  keypadLabel: "Keypad", // [PROPOSAL]
  deleteKey: "Delete", // [PROPOSAL] the keypad's ⌫ key
} as const;
