# Iron Fist Academy

[![CI](https://github.com/GaberPet/iron-fist-academy/actions/workflows/ci.yml/badge.svg)](https://github.com/GaberPet/iron-fist-academy/actions/workflows/ci.yml)
[![Code: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)
[![Content: CC BY-SA 4.0](https://img.shields.io/badge/content-CC%20BY--SA%204.0-lightgrey.svg)](LICENSES/CC-BY-SA-4.0.txt)

An open-source training academy for **Tekken 8**, aimed at **beginner and intermediate** players.
Structured lessons, a live **DualSense** combo trainer, a punishment trainer, frame-accurate training
drills and local progress tracking with personal recommendations.

**The whole roster (42 characters)** has frame data, combos and punishers, imported from Wavu Wiki and
**updated automatically every day** (see "Data and automatic updates" below). Anna Williams and Armor King also have a
full lesson curriculum and coach notes; more curricula are welcome (see [docs/DECISIONS.md](docs/DECISIONS.md)).

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
`npm run typecheck`, `npm run import-data` (re-import the roster from Wavu Wiki; normally done by the nightly job).

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
| Move Library | All imported moves (6,500+ across the roster) with startup/block/hit/CH/damage/hit level/properties, derived safety class, source + revision, and **coach notes** (labelled as strategic advice) for key moves. Filter by hit level, safety, role. **Correct any value** locally; corrections are marked "Edited by you". |
| Combo Lab | 2,500+ Wavu-documented routes for the whole roster (about 92% checkable by the trainer, the rest shown as written), with search and section filters; curated routes add PS icons + notation per step, timing notes, stance-transition notes pulled from the move data, damage exactly as listed, common mistakes, easier alternatives. Modes: **Step-by-step, Full, Slow, Memory, Consistency, Challenge** (situation → pick route → perform), **Demo** playback on a controller diagram, **focus drill** on a single transition, and **Manual mode** for practising inside Tekken 8. |
| Punishment | Punishment mode: a real unsafe opponent move with its block value → choose your guaranteed punisher → execute it on the controller. Punisher tables from Wavu. |
| Bot Dojo | 3D simulation drills: standing punish, crouching punish, mid/low defence, throw breaks, whiff punish, and **adaptive pressure** (mixes punishable, safe/plus, lows and throws; serves more of what you fail). The bot is drawn as the character whose move it uses and moves from basic to signature to stance / Heat moves over a session. Easy/normal/hard reaction windows. Tekken 8-style frame meter. |
| Free Fight | A full 3D match (or **Practice** against a configurable dummy) against a bot that plays a real character with its own frame data, punishers and combo routes. Tekken 8's documented systems: 180 HP and recoverable health, Heat (Heat Burst, Engagers, Heat Dash, Heat Smash, chip), Rage at 45 HP and Rage Art, air-combo scaling, walls and wall splats, tornado, throws and breaks, sidesteps against tracking, dash / backdash, tech rolls, low parry. Frame advantage readout after every exchange. Original procedural 3D fighters in each character's fighting style, synthesised sound. |
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
- **The Bot Dojo and Free Fight are simulations**, not Tekken 8. They use real startup / block / hit /
  recovery numbers, move properties and Tekken 8's documented rules, but reach (no range data exists),
  movement speeds, tracking angles, juggle gravity, string timing between hits and recoverable-health
  amounts are approximations, and there are no real hitboxes. Some punishes that work there whiff in
  the game at long range. The 3D fighters are original generic figures, not the game's characters.
- **Recognizer windows are app settings**, not Tekken 8's real input buffers (which can't be measured
  from outside the game).
- **Controller:** the Gamepad API does not report USB vs Bluetooth, so connection type isn't shown.
  Chromium may stop delivering controller input while the window is unfocused. The PS and touchpad
  buttons may be captured by Windows/Steam. Rumble works only where Chromium exposes it.
- **Data coverage:** the app shows what Wavu documents. Some characters' pages are thin (for example
  Panda or Kuma have few routes), and about 8% of routes use notation the trainer can't check yet; those
  are view-only. The app ships what is documented rather than inventing routes. Some
  Wavu values carry "?" (unconfirmed) in the source; they are shown verbatim.
- **Frame data can lag behind patches.** Each data set shows its source revision and fetch date;
  it updates automatically from the wiki; you can also correct values locally.
- Combo difficulty stars and coach notes are **opinions**, labelled as such.
- Full lesson curricula exist only for **Anna** and **Armor King** so far; other characters get the shared
  fundamentals plus all data-driven features.
- Automatic updates follow Wavu Wiki, which the community updates after patches, typically within days, not instantly.

## 6. Data and automatic updates

```
Wavu Wiki ──(daily GitHub Action: scripts/import-wavu.mjs)──► public/data/*.json
                    │ typecheck + tests must pass, else nothing is committed
                    ▼
        commit "data: update from Wavu Wiki" ──► redeploy website ──► app loads new data
```

- **What is imported**, for every character on Wavu's roster (new DLC characters appear automatically):
  frame data (Cargo API), combo routes (combo page, including "Fake Combos" excluded and placeholder
  rows dropped), punisher tables, and the character overview (intro, strengths/weaknesses, stances, Heat).
- **When:** every day at 05:17 UTC (`.github/workflows/update-data.yml`), or manually via
  *Actions → Update character data → Run workflow*. A file is only rewritten when its content changed,
  so there are no empty commits.
- **Safety gates:** a character keeps its previous data if its fetch fails or its move count drops by
  more than 30% (vandalism or outage). The run fails, and GitHub emails you, only if most of the
  roster failed or the tests fail.
- **What changed:** each run records added/removed combos, frame-data changes and new characters in
  `public/data/changelog.json`. The app shows it on the **What's new** page, marks characters and combos
  from the last 7 days with a **New** badge (Combo Lab can filter "New this week"), and shows the data
  date on every page.
- **How the app gets it:** the website serves the data next to the app, so a redeploy is all it takes.
  The desktop app ships a copy and checks the website for a newer data set on start (falling back to
  its copy offline). Both re-check every few hours while open. *(The website only exists once the
  repository is public; until then the desktop app uses its bundled data.)*

| Data | Source | Notes |
|---|---|---|
| Frame data, combo routes, punisher tables, overviews (`public/data/`) | Wavu Wiki, CC0 | Generated; records page revisions. Don't hand-edit: fix the wiki or correct values locally in the app. |
| Lessons, coach notes, combo tips (`src/data/characters/<id>/curated.json`) | Written for this project, CC BY-SA 4.0 | Labelled as strategic advice; avoid frame numbers in prose (the UI shows live numbers). |
| Safety classes, quiz answers | Computed from frame data with general rules | Never hand-entered. |

`npm test` checks every generated file (shape, counts, notation of trainable routes) and runs the strict
**content integrity test** for curated content: every move, combo, lesson link and exercise must resolve
against the current frame data.

## 7. Adding a curriculum for a character

Every character already works with imported data. To add lessons and coach notes:

1. Copy `src/data/characters/anna/curated.json` to `src/data/characters/<id>/curated.json`
   (`<id>` is the file name in `public/data/characters/`).
2. Fill in the profile, key-move notes, curated combos (with coaching tips), punishers and lessons.
   Exercise types: `input`, `combo`, `quiz` (`safety`, `hitlevel`, `startup`, `punisher`, `notation`,
   `throwbreak`), `drill` (`punish-standing`, `punish-crouching`, `block-mixup`, `throw-break`,
   `whiff-punish`, `mixed-pressure`) and `checklist`.
3. Add it to `CURATED` in `src/data/index.ts`.
4. Run `npm test`.

## 8. Project structure

```
electron/          main process (window, atomic JSON storage, dialogs) + preload bridge
scripts/           Wavu importer, dev runner
src/core/          pure logic: notation parser, input mapping, recognizer, frame rules,
                   quizzes, progress/mastery/recommendations, bot simulation (+ unit tests)
src/data/          frame data (imported), curated content, registry, integrity test
src/runtime/       Gamepad/keyboard input manager, storage, data loading/update checks
public/data/       generated roster data (manifest + one JSON file per character), refreshed nightly
src/ui/            React app: store, pages, components
```

Local data (Windows): `%APPDATA%\Iron Fist Academy\data\` — `settings.json`, `progress.json`,
`overrides.json`, `frame-cache.json`, each with a `.bak` copy. Delete the folder to start fresh.

## 9. Tests

`npm test` runs 135 tests: change detection for the What's new page, the Wavu parsers (combo, punisher and character pages), every generated character file, notation parsing, controller mapping (DualSense layout, stick/D-pad,
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
- **"Could not load character data":** the data files are missing from the build; run `npm run import-data` then `npm run build`.

## 11. Licence

- **Code:** [MIT](LICENSE)
- **Curated content** (lessons, coach notes, combo write-ups): [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt)
- **Frame data** from Wavu Wiki: CC0 (public domain)

Details and trademark notice: [NOTICE.md](NOTICE.md). Project decisions and roadmap: [docs/DECISIONS.md](docs/DECISIONS.md).
