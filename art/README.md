# Gnomeward art workshop

All character, enemy, environment, projectile, and range geometry is generated in Blender by `generate_assets.py`. The character portraits and hero lineup are also rendered in Blender. These are original models inspired by the supplied plush gnome photographs; no Bloons assets are included.

## Rebuild

Requires Blender 4.3 or newer with its bundled glTF exporter. From the repository root:

```sh
blender --background --python art/generate_assets.py
```

The script writes all runtime assets to `public/assets` and saves the complete editable asset collection to `art/gnomeward.blend`. It uses CPU Cycles for portable rendering. Mesh generation is deterministic. Exported models use glTF Y-up with the front facing +Z. Gnomes stand approximately 1.5 units tall, with ground at Y=0. `ground.glb` and `path.glb` are centered unit cubes. `ring.glb` has a unit major radius on the XZ plane. Projectile and explosion meshes have unit radii.

The `.blend` file stores the meshes hidden to keep portrait renders clean; reveal hidden objects in the Outliner to edit an asset. Character meshes are joined with named materials. On skeletons, recolor the `cream` bone material (`purple` on the boss) while preserving `ink` eye sockets and bright eyes.

## Art direction

Rounded woodland toy proportions, oversized bent wool hats, red pompoms, hidden eyes, large noses, ivory beards, tartan coats and soft boots. Defender colors carry across hat, clothing, and weapon. Environment pieces share a warm low-poly garden palette. Assets are intentionally compact and reusable across all five maps.
