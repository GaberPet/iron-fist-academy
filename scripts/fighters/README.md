# Realistic fighter models

`public/models/<id>.glb` are generated, not hand-made, so anyone can rebuild or change them.

- Bodies, skins, eyes, eyebrows, eyelashes, hair and clothes: MakeHuman system assets, exported
  through MPFB2 (the MakeHuman plugin for Blender). Exported MakeHuman characters are CC0.
- `roster.mjs` describes each character (build, ethnicity, age, skin, hairstyle, outfit). These are
  original, generic looks, not copies of the game's character designs.
- `gen_fighter.py` builds one character in Blender, fits the clothes to the final body, turns
  shirts into bare chests where the roster asks for it, makes skin and cloth opaque, shrinks the
  textures and exports a GLB with the `game_engine` skeleton.

Rebuild (Blender 4.5 with the MPFB2 extension and the CC0 "makehuman_system_assets" pack):

```
node scripts/fighters/roster.mjs specs
blender -b --python scripts/fighters/gen_fighter.py -- specs/jin.json public/models/jin.glb
```

In the app, `src/ui/three/human3d.ts` drives the skeleton with the fight animations, curls the
fingers into fists and recolours hair and fight trousers.
