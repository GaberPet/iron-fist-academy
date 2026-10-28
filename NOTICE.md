# Licensing and notices

Iron Fist Academy combines material under three licences.

| Material | Location | Licence |
|---|---|---|
| Source code (TypeScript, JavaScript, CSS, build scripts, workflows) | everything not listed below | [MIT](LICENSE) |
| Curated training content: lessons, coach notes, combo write-ups and mistake lists, character overviews | `src/data/general.json`, `src/data/characters/*/curated.json` | [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt) |
| Frame data, combo routes and punisher tables imported or transcribed from Wavu Wiki | `src/data/characters/*/frames.json` and the routes / punisher entries in `curated.json` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): public domain, from [Wavu Wiki](https://wavu.wiki) |

When you reuse curated content, credit "Iron Fist Academy contributors" with a link to
https://github.com/GaberPet/iron-fist-academy, and share adapted versions under CC BY-SA 4.0.

By contributing, you agree that code contributions are licensed under MIT and content contributions
under CC BY-SA 4.0 (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Trademarks

Iron Fist Academy is an unofficial fan project. It is not affiliated with, endorsed, sponsored or
approved by Bandai Namco Entertainment Inc. TEKKEN and all related names and characters are
trademarks of Bandai Namco Entertainment Inc. Character and move names are used only to describe
what the training material refers to. The project contains no game assets (art, audio, models or
video). The 3D fighters are original, generic people built from CC0 MakeHuman assets (Kuma, Panda
and Jack-8 use simple models made in code); the arena, animations and sound effects are generated in
code. None of them are models of the game's characters.

## Third-party libraries

- [three.js](https://threejs.org) (MIT): 3D rendering, including its post-processing examples.
- 3D fighter models (`public/models`): generated from [MakeHuman](http://www.makehumancommunity.org)
  system assets with MPFB2; exported MakeHuman characters are CC0. See `scripts/fighters/README.md`.
- Fonts: Teko and JetBrains Mono (SIL Open Font License), Metropolis (Unlicense).

## Game mechanics references

The fight simulation follows Tekken 8's publicly documented systems (health, recoverable
health, Heat, Rage, combo scaling, throw breaks, tech rolls, low parry) as described on
[Wavu Wiki](https://wavu.wiki) (CC0) and in Bandai Namco's own game guides.
