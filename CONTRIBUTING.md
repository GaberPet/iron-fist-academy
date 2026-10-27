# Contributing to Iron Fist Academy

Thanks for helping! This project is a training tool for **beginner to intermediate** Tekken 8 players.
Accuracy matters more than volume: a small set of correct combos beats a big set of guesses.

## Ways to help

- **Report a data error:** a wrong frame value, damage or input. Use the *Data correction* issue
  template and include where you verified it (Practice mode frame display, patch version, source link).
- **Add a combo:** use the *New combo* template, or open a PR editing
  `src/data/characters/<id>/curated.json`. Combos must come from a public source (e.g. Wavu Wiki) or be
  verified in Practice mode; say which.
- **Curate a character:** see "Adding a character" below.
- **Code:** bug fixes and features. For anything big, open an issue first so we can agree on the approach.

## Development setup

Requirements: Node.js 22 or 24 LTS.

```bash
npm ci
```

```bash
npm run dev:web
```

opens the web version at http://localhost:5199. `npm run dev` runs the Electron desktop shell.

Before opening a PR:

```bash
npm run typecheck
```

```bash
npm test
```

CI runs the same checks on every pull request.

## Data rules

1. **Never invent** frame data, inputs, damage values or combo routes.
2. Everything in `public/data/` is generated from Wavu Wiki by `npm run import-data` and refreshed daily
   by GitHub Actions. Don't hand-edit it: if Wavu is wrong, fix it on Wavu (it's a wiki) and the next
   nightly run picks it up, or report it with a data-correction issue.
3. Combo routes, punisher windows and damage are copied **verbatim** from the source with its URL and
   page revision in the `source` field.
4. Coach notes and lesson text are strategic advice. Keep them qualitative: don't repeat frame numbers in
   prose (the UI shows live numbers next to them, and prose goes stale after patches).
5. `npm test` includes an integrity test: every move, combo, lesson link and exercise must resolve
   against the imported data. A failing integrity test means the content references something that
   doesn't exist.

## Adding a character curriculum

All characters on Wavu's roster are imported automatically. To add lessons and coach notes for one:

1. Find its id (file name) in `public/data/characters/`.
2. Copy `src/data/characters/anna/curated.json` to `src/data/characters/<id>/curated.json` and fill in
   the profile, key-move notes, combos, punishers and lessons.
3. Register it in `CURATED` in `src/data/index.ts`.
4. Run `npm test`.

## Style

- TypeScript, React function components, no UI framework. Match the surrounding code.
- Pure game logic lives in `src/core/` with unit tests next to it.
- Keep PRs focused: one feature or fix per PR.

## Licensing of contributions

By submitting a contribution you agree that code is licensed under the [MIT licence](LICENSE) and
content (lessons, notes, combo write-ups) under [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt), as described
in [NOTICE.md](NOTICE.md). Only submit material you have the right to share. Don't add game assets.

## Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
