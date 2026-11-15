# Deployed journeys (E2E-D)

Playwright tests against production (`https://aliens.jackgl.com`), run by the owner from a laptop after a release
([I §I.2.1](../../../../docs/plan/I-validation.md#i21-test-levels), Phase 23). They are not part of `npm test` (Vitest only
looks in `src/`) and never run in CI. They use only the test accounts `test-player-1` and `test-player-2`
([I §I.2.10](../../../../docs/plan/I-validation.md#i210-test-accounts-and-test-data)).

| Spec | What it proves |
|---|---|
| `journey.spec.ts` | The B3.2 "done when" list on `test-player-1`: a clip plays through the real speech service (audio from stored bytes, `POST /api/speech` 200, no `speechSynthesis`); with the speech response held back 3 s, the stored clip still starts first and the request is still sent; three attempts (wrong, wrong, right) and one reward; a refresh after one and after two wrong answers keeps the attempts, the greyed options and the option order; Save and exit, then a fresh browser with no local state continues the same run at the same wave and credits; the run finishes and reopening it shows its final screen |
| `sessions.spec.ts` | AC-05 basic: sign out, the next sign-in asks for the password again, the second child sees nothing of the first. AC-28 fence: a second browser on `test-player-2` is told "You're already playing on …" until the first saves and exits |

## Before you run

- A release is live and Home offers **New game** for a 6-year-old (the seeded `ph-0102` activity and its `phoneme-sh`
  clip are approved and published through the admin app, Phase 20 owner actions).
- Node 24 (`nvm use` in `web/`) and `npm install` done in `web/`.
- Google Chrome installed (the default browser here is your installed Chrome, so nothing is downloaded).

## Run

From the repository root. The passwords are read from SSM into your shell only; they are never written to a file,
printed or committed.

```sh
account_pw() { aws ssm get-parameter --profile space-tower-defence --region eu-west-2 --with-decryption \
  --name "/space-tower-defence/prod/accounts/$1" --query Parameter.Value --output text; }
export SCD_E2E_PASSWORD_TEST_PLAYER_1="$(account_pw test-player-1)"
export SCD_E2E_PASSWORD_TEST_PLAYER_2="$(account_pw test-player-2)"

cd web/player
npx playwright test e2e/deployed                  # both specs, about 5-8 minutes
npx playwright test e2e/deployed/journey.spec.ts  # the B3.2 journey only

unset SCD_E2E_PASSWORD_TEST_PLAYER_1 SCD_E2E_PASSWORD_TEST_PLAYER_2
```

Options (environment variables):

| Variable | Default | Use |
|---|---|---|
| `E2E_BROWSER` | `chrome` | `chrome` or `msedge` (installed browsers); `chromium`, `firefox`, `webkit` after `npx playwright install <name>` (downloads to `~/.cache/ms-playwright`). WebKit is not Safari: check Safari by hand |
| `E2E_EXTRA_PLAY_PRESSES` | `2` | Extra Play presses after the first. Set `9` for the 10 presses of the latency measurement |
| `E2E_BASE_URL` | `https://aliens.jackgl.com` | A `*.cloudfront.net` name is refused: M1 is not done there |

Add `--headed` to watch. The journey prints the run ID, one line per Play press (press to audio start, the
`POST /api/speech` round trip, and its API Gateway `requestId` for the `tts` log check in
[m1-done-when.md](../../../../docs/validation/m1-done-when.md) row 1b) and a count of API calls by method, path and status. Copy those into
[browsers.md](../../../../docs/validation/browsers.md) and the speech-latency sheet in
[docs/validation/performance/](../../../../docs/validation/performance/).

## Safety

- Traces and videos are off: a trace records request headers (the access token) and typed values. Screenshots are
  taken only on failure, into `web/player/test-results/` (git-ignored); delete them when you are done.
- The network summary keeps method, path and status only, never headers or query strings (the audio URL is signed).
- Passwords are typed with a script, so they never appear in a step title, an error message or the report.

## Unfinished runs

The journey plays its run to the end. If it fails part-way, that run stays open on `test-player-1`. After five open
runs, New game answers "You have 5 games on the go" (`RUN_LIMIT_REACHED`). Until Give up arrives (Phase 29), finish one
by hand: sign in as `test-player-1` in a private window, Continue, and play it to the end (or let the aliens through).
`sessions.spec.ts` reuses `test-player-2`'s open run, so it never leaves more than one.
