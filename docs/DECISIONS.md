# Project decisions

Recorded 2026-10-24. Change a decision by opening an issue or PR that updates this file.

| # | Topic | Decision | Why |
|---|---|---|---|
| 1 | Direction | Open community tool: free, open source, community can contribute characters and combos | Fighting-game knowledge is community-built (Wavu, tekkendocs); a training tool benefits the same way. |
| 2 | Target players | Beginners to intermediate | The biggest gap: new players have frame data but no structured path or practice feedback. Advanced reference stays available but is not the focus. |
| 3 | Characters | Full roster, data-driven | Frame data for every character is importable from Wavu; curated lessons/combos are added per character over time. Anna and Armor King are curated first. |
| 4 | Platform | Web first, desktop kept | The main product is a website (GitHub Pages) that can be installed as a PWA. The Electron build stays as an optional download from the same code. |
| 5 | Code licence | MIT | Lowest friction for users and contributors. |
| 6 | Content licence | CC BY-SA 4.0 | Lessons and coach notes stay reusable but adaptations must remain open. Wavu-derived data stays CC0. |
| 7 | Name | Iron Fist Academy (`iron-fist-academy`) | Avoids leading with the TEKKEN trademark; "for Tekken 8" is used descriptively. |
| 8 | Visibility | Private until the first web release is ready, then public | Avoid a half-finished first impression. GitHub Pages needs a public repo on a free plan. |
| 9 | Infrastructure | CI (typecheck, tests, build), GitHub Pages deploy, Windows release builds on version tags, contribution kit | Keeps data and code trustworthy as outside contributions arrive. |
| 10 | First focus | Web version + PWA polish | Matches decision 4. |
| 11 | Data updates | Daily GitHub Action re-imports Wavu, gates on tests, commits only real changes, redeploys | Data stays current after patches with no manual work, and users load data from our site instead of hitting the wiki. |

## Standing principles

- **Accuracy over quantity.** No invented frame data, inputs, damage or combo routes. Every data set records
  its source and revision; unverified information is labelled.
- **No game integration hacks.** The app never reads Tekken 8 memory, injects inputs, hooks the process or
  touches online play.
- **Honest feedback.** No fake progress data; simulation features are labelled as simulations.
- **Local-first.** Core features need no account or subscription; data stays on the user's device.

## Roadmap

1. **Web/PWA:** first-class browser build, installable, offline-capable, responsive; deployed to Pages.
2. ~~**Full roster data:**~~ done: all characters imported (frame data, combos, punishers, overviews), refreshed daily by GitHub Actions.
3. **Beginner experience:** onboarding, first-run tutorial, clearer early lessons.
4. **Curated content:** contributor-friendly combo and lesson authoring; more characters curated.
5. **Real-hardware validation:** DualSense testing on Windows (USB/Bluetooth) in Chrome, Edge and the desktop build.
