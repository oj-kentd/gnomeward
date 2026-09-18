# Gnomeward art workshop

All character, enemy, environment, projectile, and range geometry is generated in Blender by the source scripts in this directory. The character portraits and hero lineup are also rendered in Blender. These are original models inspired by the supplied plush gnome photographs; no Bloons assets are included.

## Rebuild

Requires Blender 4.3 or newer with its bundled glTF exporter. From the repository root:

```sh
blender --background --python art/generate_assets.py
```

The original script writes the base runtime assets to `public/assets` and saves the original editable collection to `art/gnomeward.blend`. Run the additional generators below for the current scenery, secret collection, and entrance markers. It uses CPU Cycles for portable rendering. Mesh generation is deterministic. Exported models use glTF Y-up with the front facing +Z. Gnomes stand approximately 1.5 units tall, with ground at Y=0. `ground.glb` and `path.glb` are centered unit cubes. `ring.glb` has a unit major radius on the XZ plane. Projectile and explosion meshes have unit radii.

The `.blend` file stores the meshes hidden to keep portrait renders clean; reveal hidden objects in the Outliner to edit an asset. Character meshes are joined with named materials. On skeletons, recolor the `cream` bone material (`purple` on the boss) while preserving `ink` eye sockets and bright eyes.

## Art direction

Rounded woodland toy proportions, oversized bent wool hats, red pompoms, hidden eyes, large noses, ivory beards, tartan coats and soft boots. Defender colors carry across hat, clothing, and weapon. Environment pieces share a warm rounded toy garden palette. Assets are intentionally compact and reusable across all seven maps.

## Rounded garden environment

The current toy garden scenery is generated separately so art updates cannot overwrite characters or secrets:

```sh
blender --background --python art/generate_environment.py
```

This writes the environmental GLBs, the editable `art/environment.blend`, and a rendered `art/environment-preview.png`. Add `-- --closeup` for a fast cottage inspection render at `art/cottage-preview.png`. After a full rebuild with the original `generate_assets.py`, run this environmental generator to restore the current rounded scenery. Its shared primitive builders come from the original script, while character export commands are never executed.

`ground.glb`, `path.glb`, and `water.glb` remain centered unit cubes with a small normalized edge bevel. `path-tile.glb` is a separate softly rounded cobblestone: X width 0.70, Z depth 1.38, Y height 0.10, with its base at Y=0. Scale only its X dimension to fit route spacing; a slight gap between stones reveals the continuous path beneath. Trees and shrubs use smooth padded foliage lobes, the cottage has a curved roof and arched door, and smaller props share the same rounded matte toy finish as the gnomes.


## Secret gnomes and entrance arrows

The secret collection and route entrance markers have separate generators, which preserve the existing character family and environment:

```sh
blender --background --python art/generate_secret_assets.py
blender --background --python art/generate_entry_arrow.py
```

`art/secrets.blend` contains Orbit, Prism, their world effects and the secret pickups. Orbit retains the reference's grey hat, red/black plaid body, white beard and red pompom. On `secret-crystal.glb`, tint the `secret-gem` material while keeping the stone base unchanged. `black-hole.glb` has radius 1 on the XZ plane; `crystal-barrier.glb` is approximately 1.17 units wide.

`art/entry-arrow.blend` contains the rounded green-and-cream entrance marker. `entry-arrow.glb` points +Z in Three.js, stands at Y=0, and has an approximately 0.64 × 0.995 footprint. Orient it to the first segment of each entrance route.

For a full art rebuild, run the original asset generator first, then the environment, secret, and entrance-arrow generators. All sources and render outputs are original Blender work; none of these art generators touches music files.

## Necromancer and reborn helpers

```sh
blender --background --python art/generate_necromancer.py
```

This exports Morrow’s `gnome-necro.glb` and `necro.png` portrait, the 1.05-unit-tall `reborn-gnome.glb`, a compact `soul-puff.glb`, four subtly marked pumpkin models, and the cottage’s `necro-clue.glb` plaque. All characters face +Z with their bases at Y=0. `art/necromancer.blend` is the editable collection; `art/necromancer-preview.png` shows the new family of assets. The pumpkin material named `pumpkin-rune` has no initial emission; the renderer lights it only after a correct discovery. Existing characters and garden assets are preserved.


## Strawberry Fields

```sh
blender --background --python art/generate_strawberry.py
```

This separately exports `gnome-strawberry.glb` and its `strawberry.png` portrait, the rounded `strawberry-fruit.glb` mortar projectile, `strawberry-seed.glb` shrapnel and `strawberry-bush.glb` field decoration. The gnome keeps the original plush proportions with a red seeded hat, green leaf accents, an ivory beard and a hollow toy mortar. The fruit's cream seeds and green leaves are separate material regions; preserve those colors when rendering it. Fruit and seed projectiles are centered on the origin; the berry's radius is approximately one unit and the elongated seed has a one-unit major radius. The bush has an approximately 1.2-unit footprint and a low padded base. `art/strawberry.blend` is the editable source collection, and `art/strawberry-preview.png` shows the family together. Strawberry Fields uses the existing rounded garden and path assets together with these berry plants; it does not require a monolithic map model. Existing assets are preserved.
