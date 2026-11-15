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
  failed: "Good try. No credits this time — you can keep playing.", // D6.4 third incorrect
  answerWas: "The answer was", // D6.4 "The answer was …" (the answer follows in the reading font)
  voided: "This one had a mistake, so we took it away. You still get your reward.", // D6.4 voided
  notSaved: "That didn't save. Press Check again.", // D6.4
  continue: "Continue",
  saveAndExit: "Save and exit",
  optionLabel: (n: number, text: string) => `${n}: ${text}`, // [PROPOSAL] screen-reader name of an option
  triedLabel: (n: number, text: string) => `${n}: ${text}, tried`, // [PROPOSAL]
} as const;
