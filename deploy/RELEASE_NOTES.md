Gnomeward 0.4.0 adds merged gnome forms in solo and co-op.

- Merge Sprout, Tumble, and Morrow into Sproutstorm, Gravebloom, or Soulstorm; add the missing third gnome to create Trinity.
- Keeps each component’s abilities and upgrades, with separate tabs in the unit panel and four new Blender models.
- Morrow grants guardian summoning to the form’s direct attacks. Guardians never summon additional guardians.
- Purchased Turbo Tumble gives every attack pattern in a Tumble form 3× speed, without stacking or accelerating guardian dispatch.
- Merged units put costumes aside; owned costumes stay in the collection.
- Co-op validates ownership, shares merged state, and retains it through reconnects. Older servers remain joinable with merging disabled.
- Includes the annual September 22–28 Tumble Day offer: 50 Round Coins during the event, 1,000 otherwise. Purchases remain permanent.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.4.0/docs/UNRAID.md)**

Download the image and `SHA256SUMS`, verify the checksum, and load the image with Docker. Set the container’s Repository to `gnomeward-server:0.4.0` and Apply. Keep the same data mount, port, environment variables, and Cloudflare route. Finish active games before restarting.

Verify `/healthz` reports `0.4.0` and `fusionVersion: 1`, refresh both browsers, and create a new room. You can update directly from any earlier release. No save migration is required.
