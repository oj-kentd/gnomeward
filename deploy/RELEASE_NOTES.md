Gnomeward 0.2.5 adds two deliberately powerful late-game combinations, with original Blender-made fireworks. The server image is packaged for Unraid (Linux amd64).

- **Sporefire:** Morel’s Potent Spores 3 + Wild Garden 3 primes enemies. A direct hit from Bramble with Big Bang 3 ignites a green/violet spore burst and amber sparks. Overlap their coverage; the burst scales with enemy toughness, with reduced boss scaling and a shared reaction cooldown.
- **Prismstorm:** Tumble’s Whirling Wonders 3, within 7 range of a Prism with Diamond Walls 3 + Shattering Light 3, periodically fires homing crystal volleys. Shards bounce through distinct enemies; no live barrier is required.
- Recipes appear in the field guide, final-tier upgrades, and selected-gnome panel. First activation gets a named celebration. Existing Orbit/Strawberry and Aster strategies remain unchanged.
- Both combinations cleared round 75 with 100 lives in earned-wallet co-op tests. These are capable late-game builds, not a guarantee for every placement. Teammates can supply opposite halves of each pairing.
- Visual effects are capped independently of damage and respect reduced motion. Shared auto rounds, readiness, and smooth co-op movement remain supported.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.2.5/docs/UNRAID.md)**

Download the 0.2.5 image and `SHA256SUMS`, verify the checksum, then load the image with Docker. Set the Unraid container’s Repository to `gnomeward-server:0.2.5` and Apply. Keep the existing data mount, port, environment variables, and Cloudflare route. Finish active games before restarting the container.

Verify `/healthz` reports 0.2.5, refresh both browsers, and start a new room. Solo receives the combos through the website update; co-op requires this server image. Older servers continue to work and show a combo update hint.
