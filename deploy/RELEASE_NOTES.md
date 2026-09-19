Gnomeward 0.2.7 adds another hidden combination to discover, with a new Blender-made effect and orbiting black-seed shrapnel.

- Each hidden interaction needs one completed upgrade path per character; other paths are optional.
- Recipes stay out of the field guide, upgrade panels, and discovery messages.
- New projectiles briefly orbit before flying outward. The server owns their timing, damage, collision, and piercing.
- Shared cooldowns and projectile limits keep the interaction bounded in solo and co-op.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.2.7/docs/UNRAID.md)**

Download the image and `SHA256SUMS`, verify the checksum, then load it with Docker. Set the Unraid container’s Repository to `gnomeward-server:0.2.7` and Apply. Keep the same data mount, port, environment variables, and Cloudflare route. Finish active games before restarting.

Verify `/healthz` reports 0.2.7, refresh both browsers, and start a new room. This release includes the hidden-recipe changes from 0.2.6; you can update directly from an older version.
