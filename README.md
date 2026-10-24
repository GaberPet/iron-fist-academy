# Iron Fist Academy

[![CI](https://github.com/GaberPet/iron-fist-academy/actions/workflows/ci.yml/badge.svg)](https://github.com/GaberPet/iron-fist-academy/actions/workflows/ci.yml)
[![Code: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)
[![Content: CC BY-SA 4.0](https://img.shields.io/badge/content-CC%20BY--SA%204.0-lightgrey.svg)](LICENSES/CC-BY-SA-4.0.txt)

An open-source training academy for **Tekken 8**, aimed at **beginner and intermediate** players.
Structured lessons, a live **DualSense** combo trainer, a punishment trainer, frame-accurate training
drills and local progress tracking with personal recommendations. Anna Williams and Armor King are
curated first; the rest of the roster is coming (see [docs/DECISIONS.md](docs/DECISIONS.md)).

Runs in the browser (Chrome/Edge read the DualSense directly) and as an optional Windows desktop app.

> Unofficial fan project, not affiliated with or endorsed by Bandai Namco. TEKKEN is a trademark of
> Bandai Namco Entertainment Inc. Frame data comes from [Wavu Wiki](https://wavu.wiki) (CC0).

**Project status:** early development (v0.1). Contributions welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 0. Web version

`npm run dev:web` serves the web version locally at http://localhost:5199. A hosted version will be
published to GitHub Pages automatically once the repository is public.

## 1. Install and run (Windows)

**Option A: prebuilt files** from the [Releases page](https://github.com/GaberPet/iron-fist-academy/releases) (built by CI from version tags)

- `Iron Fist Academy Setup 0.1.0.exe`: installer (choose the install folder, creates shortcuts)
- `Iron-Fist-Academy-0.1.0-portable.exe`: single file, no install, just run it

The executables are **not code-signed**, so Windows SmartScreen will warn on first launch:
click **More info → Run anyway**.

**Option B: build it yourself on Windows**

1. Install [Node.js 22 or 24 LTS](https://nodejs.org) (includes npm).
2. In a terminal inside this folder:

```bash
npm install
```

```bash
npm test
```

```bash
npm run dist:win
```

The installer and portable `.exe` appear in `release/`.

The two install scripts the project needs (Electron and esbuild) are pre-approved in `package.json`
(`allowScripts`), so npm 11+ runs them without prompting.

## 2. Development version

```bash
npm run dev
```

This starts Vite and opens the Electron window with hot reload. `npm run dev:web` runs only the UI in a
browser at http://localhost:5199 (data is then kept in browser localStorage instead of files).

Other scripts: `npm run build` (typecheck + production bundle), `npm start` (run the built app),
`npm run typecheck`, `npm run import-data` (re-import frame data from Wavu Wiki).

## 3. Connecting your DualSense

- **USB:** plug it in.
- **Bluetooth:** hold **PS + Create** until the light bar flashes, then pair it in
  *Windows Settings → Bluetooth & devices → Add device*.
- **Press any button** with the app focused: browsers (and Electron) only expose a controller after
  the first input. The top bar shows *DualSense (PS5)* when it's detected.
- Open **Controller** in the sidebar to test every button, see live directions, set the stick
  deadzone, mirror for the P2 side, and assign shoulder buttons to match your in-game Button Config.
  Default layout = Tekken 8's PlayStation default: □ = 1, △ = 2, ✕ = 3, ○ = 4.
- If buttons are mixed up, use **Rebind** (click, then press the physical button).
- **Steam Input / DS4Windows / DSX** can take over the controller or present it as an Xbox pad. Turn
  Steam Input off for non-Steam apps (or close Steam) if detection is odd; an emulated Xbox pad also
  works but may need rebinding.
- A **USB cable** gives the most consistent timing.
- No controller? The keyboard works as a fallback: **WASD** = directions, **U I J K** = 1 2 3 4.

UI navigation with the controller: D-pad moves focus, ✕ selects, ○ goes back. Inside trainers the
controller drives the exercise; press **Options** to go back.

## 4. Features

| Area | What it does |
|---|---|
| Dashboard | Daily goal ring, day streak, mastery counts, **recommended next** (weak combo transitions → focused drill, failing bot drills, decayed lessons due for review, next unlocked lesson), session timer with configurable length. |
| Characters | Overview, strengths/weaknesses, stances, Heat info, sources. Progress is per character; switch any time. |
| Academy | 5 stages (Foundations → Competitive Preparation): 7 shared fundamentals lessons plus 24 Anna / 25 Armor King lessons, each with objectives, explanation, visual aid, guided exercise, independent challenge, success criterion, mistake review and related links. Stages unlock only through **mastery** (configurable %) **and** passing the stage test. |
| Move Library | All imported moves (165 Anna / 173 Armor King) with startup/block/hit/CH/damage/hit level/properties, derived safety class, source + revision, and **coach notes** (labelled as strategic advice) for key moves. Filter by hit level, safety, role. **Correct any value** locally; corrections are marked "Edited by you". |
| Combo Lab | Wavu-documented routes (8 Anna, 14 Armor King) with PS icons + notation per step, timing notes, stance-transition notes pulled from the move data, damage exactly as listed, common mistakes, easier alternatives. Modes: **Step-by-step, Full, Slow, Memory, Consistency, Challenge** (situation → pick route → perform), **Demo** playback on a controller diagram, **focus drill** on a single transition, and **Manual mode** for practising inside Tekken 8. |
| Punishment | Punishment mode: a real unsafe opponent move with its block value → choose your guaranteed punisher → execute it on the controller. Punisher tables from Wavu. |
| Bot Dojo | Simulation drills: standing punish, crouching punish, mid/low defence, throw breaks, whiff punish, and **adaptive pressure** (mixes punishable, safe/plus, lows and throws; serves more of what you fail). Easy/normal/hard reaction windows. Tekken 8-style frame meter. |
| In Tekken 8 | What works where, and Practice-mode recipes to repeat each drill in the real game. |
| Progress | Attempts/day and success-rate charts, weakest transitions, recurring error types, per-activity stats, curriculum and combo mastery, full history, **export / import / reset** (per character or all). |
| Settings & Data | Mastery threshold, combo consistency, unlock requirement, review interval, daily goal, session length, throw-break window, recognizer strictness; **refresh frame data from Wavu** with a change summary and revert; storage location. |

### What the input recognizer checks

Order of inputs, the direction held at each press, motion inputs (`f,n,d,df`, `qcf`, `hcf`, dash,
sidesteps), held directions (`~DF`, `~F`), while-standing (`ws`) and crouch inputs, simultaneous
buttons (`1+2`) within a configurable window, and the gap between inputs. When an attempt fails it
reports **which step** and **why** (wrong button, wrong direction, missing motion, not simultaneous,
missing crouch, too slow), and those failures drive the recommendations.

## 5. Known limitations (read this)

- **No integration with the game itself.** Tekken 8 has no public API. The app does **not** read game
  memory, inject inputs, hook the process or touch online play: that would be unsupported and risk
  anti-cheat action. Everything runs in the app; in-game practice uses Manual mode and the
  Practice-mode recipes.
- **The combo trainer validates inputs, not hits.** It can't know whether a hit connects in Tekken 8
  (link windows, hitboxes, character-specific juggles). Use it to learn order and rhythm; confirm
  routes in Practice mode.
- **The Bot Dojo is a simulation**, not Tekken 8. It uses real startup / block / recovery numbers and
  Tekken's frame rules, but no animations, range, pushback, hitboxes, tracking or real AI. Some punishes
  that work there whiff in the game at long range. The throw-break window (default 20f) is an
  adjustable approximation.
- **Recognizer windows are app settings**, not Tekken 8's real input buffers (which can't be measured
  from outside the game).
- **Controller:** the Gamepad API does not report USB vs Bluetooth, so connection type isn't shown.
  Chromium may stop delivering controller input while the window is unfocused. The PS and touchpad
  buttons may be captured by Windows/Steam. Rumble works only where Chromium exposes it.
- **Data coverage:** Anna's Wavu combo page currently has only a BnB, one staple and mini-combos, and
  its wall-combo section is empty. The app ships what is documented rather than inventing routes. Some
  Wavu values carry "?" (unconfirmed) in the source; they are shown verbatim.
- **Frame data can lag behind patches.** Each data set shows its source revision and fetch date;
  refresh it in Settings or correct values locally.
- Combo difficulty stars and coach notes are **opinions**, labelled as such.
- Only **Anna** and **Armor King** are bundled.

## 6. Data and accuracy

| Data | Source | Notes |
|---|---|---|
| Frame data (`src/data/characters/<id>/frames.json`) | Wavu Wiki Cargo API, CC0 | Records page revision and fetch time. Imported by `scripts/import-wavu.mjs`, refreshable in-app. |
| Combo routes, punisher tables | Wavu Wiki combo / punisher pages, CC0 | Transcribed verbatim, with revision; damage brackets shown exactly as listed. |
| Character overview | Wavu Wiki character pages | Summarised. |
| Coach notes, lesson text, difficulty ratings | Written for this app | Labelled as strategic advice; they avoid quoting frame numbers, which are always shown live from the data. |
| Safety classes, quiz answers | Computed from frame data with general rules (i10 fastest punisher, −15 launchable for most characters) | Never hand-entered. |

`npm test` includes a **content integrity test**: every move, combo, lesson link and exercise in the
curated files must resolve against the imported frame data, and every notation must parse.

## 7. Adding characters and exercises

1. Add the character to `CHARACTERS` in `scripts/import-wavu.mjs` (id → Wavu name) and run
   `npm run import-data`.
2. Copy `src/data/characters/anna/curated.json` to `src/data/characters/<id>/curated.json` and fill in
   the profile, key-move notes, combos (from the Wavu combo page), punishers and lessons.
   Exercise types: `input`, `combo`, `quiz` (`safety`, `hitlevel`, `startup`, `punisher`, `notation`,
   `throwbreak`), `drill` (`punish-standing`, `punish-crouching`, `block-mixup`, `throw-break`,
   `whiff-punish`, `mixed-pressure`) and `checklist`.
3. Add one entry to `BUNDLED` in `src/data/index.ts`.
4. Run `npm test`: the integrity test flags any reference that doesn't exist in the frame data.

New characters automatically become opponents in quizzes and Bot Dojo drills.

## 8. Project structure

```
electron/          main process (window, atomic JSON storage, dialogs) + preload bridge
scripts/           Wavu importer, dev runner
src/core/          pure logic: notation parser, input mapping, recognizer, frame rules,
                   quizzes, progress/mastery/recommendations, bot simulation (+ unit tests)
src/data/          frame data (imported), curated content, registry, integrity test
src/runtime/       Gamepad/keyboard input manager, storage, Wavu refresh
src/ui/            React app: store, pages, components
```

Local data (Windows): `%APPDATA%\Iron Fist Academy\data\` — `settings.json`, `progress.json`,
`overrides.json`, `frame-cache.json`, each with a `.bak` copy. Delete the folder to start fresh.

## 9. Tests

`npm test` runs 79 unit tests: notation parsing, controller mapping (DualSense layout, stick/D-pad,
SOCD, P2 mirroring, remapping), the recognizer (motions, cancels, ws, simultaneous presses, timeouts,
held buttons), frame-rule simulation (punish windows, throw breaks, whiff punish, safe-move rounds,
adaptive weights), quizzes (answers match data), progress (mastery streaks, stage gating, weakness
detection, recommendations, reset, migration) and data integrity.

`IFA_SMOKE=1 npx electron .` (after `npm run build`) launches the desktop build offscreen, round-trips
storage through the preload bridge and exits with a pass/fail result.

## 10. Troubleshooting

- **Blank window / error page:** run `npm run build` again; check the console with Ctrl+Shift+I in dev.
- **Controller not detected:** see section 3. Try another USB port/cable; re-pair Bluetooth.
- **"Save failed" badge:** the data folder isn't writable; check permissions or disk space.
- **Refresh from Wavu fails:** you're offline or the wiki is down; the existing data is kept.

## 11. Licence

- **Code:** [MIT](LICENSE)
- **Curated content** (lessons, coach notes, combo write-ups): [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt)
- **Frame data** from Wavu Wiki: CC0 (public domain)

Details and trademark notice: [NOTICE.md](NOTICE.md). Project decisions and roadmap: [docs/DECISIONS.md](docs/DECISIONS.md).
