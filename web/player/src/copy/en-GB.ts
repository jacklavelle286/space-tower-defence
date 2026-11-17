// Every child-facing string of the player shell in one place, so the owner and playtesters can check them together
// (D7.3 [ASSUMPTION]). Sync-chip lines are D7.1 verbatim; lines marked [PROPOSAL] are new wording for the owner to check.
// The learning panel's lines live with the shared panel (web/shared/src/learning/copy.ts) and are repeated here as
// COPY.learning, so this file still shows every word the player app says.
import { PANEL_COPY } from "@scd/shared/learning";

export const COPY = {
  title: "Space Colony Defence",
  landing: {
    tagline: "Defend the moon colony from silly aliens!", // D3 J1 step 1
    imNew: "I'm new",
    signIn: "Sign in",
    grownUp: "Ask a grown-up to help you make your account.", // D3 J1 step 1
  },
  callback: {
    working: "Getting your astronaut…", // [PROPOSAL]
    failed: "That didn't work. Please try signing in again.", // [PROPOSAL]
  },
  setup: {
    heading: "Let's set up your astronaut!", // D3 J1 step 3
    nameLabel: "Your name",
    nameHint: "This is the name you'll see in the game.", // D4 P3
    nameInvalid: "Use letters, numbers, spaces or hyphens (up to 20).", // [PROPOSAL]
    pictureLabel: "Pick your picture",
    birthdayLabel: "Your birthday",
    birthdayHint: "Only used to choose activities for your age. Nobody else sees it.", // D4 P3
    birthdayInvalid: "Please choose a real date.", // [PROPOSAL]
    day: "Day",
    month: "Month",
    year: "Year",
    // B-5: tap-friendly birthday pickers instead of three native selects. [PROPOSAL]
    partValue: (part: string, value: string | null) => (value === null ? `${part}, not chosen` : `${part}: ${value}`),
    choosePart: (part: string) => `Choose the ${part.toLowerCase()}`,
    done: "Done",
    saving: "Saving…",
    failed: "We couldn't save that. Please try again.", // [PROPOSAL]
  },
  home: {
    greeting: (name: string) => `Hi, ${name}!`, // D4 P4
    continueHeading: "Continue",
    continueButton: "Continue",
    wave: (n: number) => `Wave ${n}`,
    newGame: "New game",
    starting: "Starting…", // [PROPOSAL]
    noWaveSet: "There is no game you can start yet.", // [PROPOSAL]
    preview: "Test level", // Gate M, LD7 [PROPOSAL]: a preview only tester accounts see
    planetsHeading: "Planets",
    comingLater: "Coming later",
    ageOutOfRange: "We don't have activities for your age yet.", // D7.3 AGE_OUT_OF_RANGE
    bankNotReady: "Activities for your age are still being made. Please come back soon.", // D7.3 BANK_NOT_READY
    activeElsewhere: (device: string) => `You're playing on ${device} right now.`, // D4 P4
    signOut: "Sign out",
    practice: "Practice battle (development only)",
    savedGames: "Saved games", // D4 P5
    myProgress: "My progress", // D4 P12
    settings: "Settings", // D4 P13
  },
  settings: {
    // D4 P13 Settings and resets [PROPOSAL] copy: written for the grown-up
    heading: "Settings",
    back: "Home",
    // Gate M, LD7 [PROPOSAL]: the account's ID, which the grown-up who makes levels adds to the testers
    testerHeading: "Testing new levels",
    testerHint: "To play new levels before anyone else, give this tester code to the grown-up who makes them.",
    testerCode: "Tester code",
    resetsHeading: "Start again",
    changes: "What changes",
    stays: "What stays",
    typeWord: (word: string) => `Type ${word} to confirm`,
    cancel: "Keep everything",
    wait: "Wait until everything is saved to the cloud.",
    offline: "You need the internet for this.",
    done: "Done.",
    failed: "That didn't finish. Please try again.",
    offlineDevice: "A device that was offline may still add its saved progress when it reconnects.",
    pendingLost: "Some progress on this laptop hasn't saved yet and will be lost.",
    resets: [
      {
        type: "CAMPAIGN_PROGRESS",
        button: "Clear planets and badges",
        word: "badges",
        changes: "This clears your best waves and badges.",
        stays: "Your saved games stay, and you can earn badges again.",
      },
      {
        type: "LEARNING_HISTORY",
        button: "Clear learning stars",
        word: "stars",
        changes: "This clears your Maths, Phonics and Spelling stars.",
        stays: "Everything else stays.",
      },
      {
        type: "WHOLE_PROFILE",
        button: "Start my profile again",
        word: "delete",
        changes: "This deletes all your games, badges, stars, name and picture. You can't undo this.",
        stays: "Your username and password stay.",
      },
    ] as const,
  },
  runSetup: {
    // D4 P7 run setup (Phase 53); challenge names come from the wave set, "about" lines are C13's [PROPOSAL]
    heading: (planet: string) => `New game: ${planet}`,
    campaignLength: (n: number) => `${n} waves · 5 bosses`,
    waves: (n: number) => `${n} waves`,
    challenges: "Quick challenges",
    start: "Start",
    about: {
      campaign: "The whole adventure: new astronauts, bosses and meteor challenges along the way.",
      "blob-parade": "Five gentle waves with only Nova: a first taste, or a quick go.",
      "wobble-rematch": "The team is ready. Two warm-up waves, a meteor challenge, then King Wobble.",
      "bubble-trouble": "A ready-made team with Juno and Pip. Six waves of swarms and Bubble Guards.",
    } as Record<string, string>,
  },
  progress: {
    // D4 P12 My progress [PROPOSAL] copy: counts only, no percentages, grades, ages, streaks or comparisons
    heading: "My progress",
    subjects: { maths: "Maths", phonics: "Phonics", spelling: "Spelling" } as Record<string, string>,
    done: (n: number) => `Activities done: ${n}`,
    stars: (n: number) => `Stars: ${n}`,
    practising: (n: number) => `Still practising: ${n}`,
    nothingYet: "Nothing here yet. Play a game to start!",
    showTopics: "Show topics",
    hideTopics: "Hide topics",
    planetsHeading: "Planets",
    best: (planet: string, n: number) => `${planet}: best ${n} ${n === 1 ? "wave" : "waves"} cleared`,
    badgesHeading: "Badges",
    earned: "Earned",
    notYet: "Not yet",
    back: "Home",
    failed: "We couldn't load your progress. Please check the internet and try again.",
  },
  games: {
    // D4 P5 Saved games [PROPOSAL] copy
    heading: "Saved games",
    playing: "Playing",
    finished: "Finished",
    noneOpen: "No games on the go.",
    noneFinished: "No finished games yet.",
    wave: (n: number) => `Wave ${n}`,
    endlessWave: (n: number) => `Wave ${n} · endless`,
    completed: "Completed!",
    cleared: (n: number) => `Cleared ${n} ${n === 1 ? "wave" : "waves"}`,
    gaveUp: (n: number) => `Gave up after wave ${n}`,
    today: "Today",
    yesterday: "Yesterday",
    cannotOpen: "This game can't be opened right now.", // D7
    more: "Show more",
    back: "Home",
    failed: "We couldn't load your games. Please check the internet and try again.",
  },
  signOut: {
    // J9 / E.7.4 [CONFIRMED] warning; online-only variant per F §7 (no local database yet, Phase 57) [PROPOSAL]
    pendingWarning: "Some progress hasn't been saved yet. If you sign out now, your last change may need doing again.",
    stay: "Stay signed in",
    anyway: "Sign out anyway",
    offline: "Connect to the internet to sign out", // J9
  },
  run: {
    loading: "Getting your game ready…", // [PROPOSAL]
    failed: "We couldn't open this game. Please check the internet and try again.", // [PROPOSAL]
    notFound: "We couldn't find that game.", // [PROPOSAL]
    waveRestart: (wave: number) => `Wave ${wave} will start again from the beginning.`, // D7.3, spine S3.2
    elsewhere: (device: string, minutes: number) =>
      `You're already playing on ${device}. Finish there first, or try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`, // D7.3
    takeover: (device: string) => `This game may have unsaved progress on ${device}. Play here instead?`, // D7.3
    takeoverGrownUp: "Progress there that hasn't reached the cloud won't be added.", // D7.3
    playHere: "Play here",
    notNow: "Not now",
    stale: "This game was continued somewhere else.", // D7.3 DIVERGED after STALE_SESSION (options come in Phase 60)
    limit: "You have 5 games on the go. Finish or give up one first.", // D7.3 RUN_LIMIT_REACHED
    planetLocked: "This planet isn't open yet.", // D7.3 CONTENT_UNAVAILABLE PLANET_LOCKED
    previewClosed: "This test level has finished. Please choose another game.", // Gate M, LD7 [PROPOSAL]
    upgrade: "Reload to update the game", // D7.1 UPGRADE_REQUIRED
    ended: "This game has finished.", // [PROPOSAL] RUN_TERMINAL: the final screen, not an error (D7.3)
    complete: "Challenge complete!",
    defeat: "The aliens got through this time.",
    wavesCleared: (n: number) => `Waves cleared: ${n}`,
    saveAndExit: "Save and exit",
    // D4 P6 [PROPOSAL] copy: Give up = ABANDON; Finish = FINISH_RUN once the campaign is complete (spine S3.2).
    giveUp: "Give up…",
    giveUpQuestion: "Give up this game? You keep your badges and your learning stars. You can't come back to this game.",
    giveUpConfirm: "Give up",
    finish: "Finish…",
    finishQuestion: "Finish this game? Your Colony Hero badge stays.",
    finishConfirm: "Finish",
    keepIt: "Keep it",
    saving: "Saving…",
    home: "Home",
    learning: "Learning time", // [PROPOSAL] heading of the panel when the activity cannot be shown
    voidedContinue: "Continue",
  },
  // C12 badges (Phase 52): names [PROPOSAL]; rules in words for the not-yet shelf (D4 P12).
  badges: [
    { id: "first-steps", name: "First Steps", rule: "Clear wave 1 of the campaign" },
    { id: "boss-1", name: "Wobble Stopper", rule: "Clear wave 10" },
    { id: "boss-2", name: "Clank Cracker", rule: "Clear wave 20" },
    { id: "boss-3", name: "Bubble Popper", rule: "Clear wave 30" },
    { id: "boss-4", name: "Mothership Mover", rule: "Clear wave 40" },
    { id: "campaign-luna-1", name: "Colony Hero", rule: "Clear all 50 waves" },
    { id: "endless-60", name: "Star Voyager", rule: "Reach wave 60 in endless" },
    { id: "safe-and-sound", name: "Safe and Sound", rule: "Beat a boss without losing health" },
    { id: "full-crew", name: "Full Crew", rule: "Have all six astronauts out at once" },
    { id: "top-team", name: "Top Team", rule: "Upgrade an astronaut to level 3" },
    { id: "challenge-blob-parade", name: "Parade Marshal", rule: "Finish Blob Parade" },
    { id: "challenge-wobble-rematch", name: "Boss Buddy", rule: "Finish Wobble Rematch" },
    { id: "challenge-bubble-trouble", name: "Bubble Wrangler", rule: "Finish Bubble Trouble" },
  ] as const,
  complete: {
    // D4 P10 Campaign complete [PROPOSAL] copy; the endless notes are C24.6 / D-6
    heading: "You saved the colony!",
    waves: (n: number) => `Waves cleared: ${n}`,
    keepGoing: "Keep going",
    finish: "Finish this game",
    starting: "Getting ready…",
    needsInternet: "You need the internet to keep going.",
    cannot: "Endless isn't ready yet. You can finish this game and keep your badge.",
    allDone: "You have done every activity we have for now.",
  },
  meteor: {
    // D4 P9 meteor offer [CONFIRMED] wording for heading and No thanks reply; P8 full-power line [PROPOSAL]
    heading: "Meteor challenge!",
    pitch: "Win a power for the boss.",
    full: (name: string, cap: number) => `${name} is full (${cap} of ${cap}). Have a go anyway?`,
    haveAGo: "Have a go",
    noThanks: "No thanks",
    declined: "That's fine — you can still beat the boss!",
    ok: "OK",
  },
  learning: PANEL_COPY,
  offline: "You need the internet for this.", // D7.3
  loading: "Loading…",
  startFailed: "We couldn't start the game. Please check the internet and try again.", // [PROPOSAL]
  tryAgain: "Try again",
  signInAgain: {
    heading: "Sign in again to keep playing", // [PROPOSAL]
    button: "Sign in",
  },
  otherPlayer: {
    // P15 blocking screen (spine S7.2 "a different player is signed in") [PROPOSAL] wording
    heading: "A different player signed in on this computer.",
    signedOut: "You signed out in another tab.",
    reloading: "Starting again…",
    reload: "Start again",
  },
  sync: {
    SYNCED: { line: "Saved to the cloud", icon: "icon-sync-saved" },
    PENDING: { line: "Saving…", icon: "icon-sync-saving" },
    RETRYING: { line: "Couldn't save — trying again", icon: "icon-sync-retrying" },
    RETRYING_PROTOCOL: {
      line: "Saving paused while the game updates",
      grownUp: "Nothing is lost. Saving starts again by itself after the update.",
      icon: "icon-sync-retrying",
    },
    AUTH_REQUIRED: {
      line: "Sign in again to finish saving",
      // Online-only mode: unsaved steps live only in memory and the sign-in redirect loses them (F §7, D7.1).
      grownUp: "Your last change may need doing again.",
      button: "Sign in",
      icon: "icon-sync-signin",
    },
    DIVERGED_STALE: { line: "This game was continued somewhere else", icon: "icon-sync-warning" },
    DIVERGED_REJECTED: { line: "We couldn't save some progress", icon: "icon-sync-warning" },
    UPGRADE_REQUIRED: { line: "Reload to update the game", grownUp: "Your progress is kept.", button: "Reload", icon: "icon-sync-reload" },
  },
  months: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  avatars: {
    "avatar-01": "astronaut with a rocket",
    "avatar-02": "astronaut with a star",
    "avatar-03": "astronaut with a moon",
    "avatar-04": "astronaut with a comet",
    "avatar-05": "astronaut with a ringed planet",
    "avatar-06": "robot astronaut",
    "avatar-07": "friendly alien astronaut",
    "avatar-08": "astronaut with a telescope",
    "avatar-09": "astronaut with a satellite",
    "avatar-10": "astronaut with a sun",
    "avatar-11": "astronaut with a meteor",
    "avatar-12": "astro-cat",
  } as Record<string, string>,
} as const;
