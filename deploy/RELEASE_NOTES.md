Gnomeward 0.2.6 makes the new combinations secrets to discover.

- Removed recipes, upgrade hints, pairing panels, and field-guide spoilers.
- Each interaction now needs one completed path on each of two characters. Other upgrade paths remain optional.
- First activation celebrates discovery without explaining the recipe. Existing effects and damage scaling remain intact.
- Solo and co-op share the revised rules; co-op requires this server update.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.2.6/docs/UNRAID.md)**

Download the image and `SHA256SUMS`, verify the checksum, then load the image with Docker. Set the Unraid container’s Repository to `gnomeward-server:0.2.6` and Apply. Keep the existing data mount, port, environment variables, and Cloudflare route. Finish active games before restarting.

Verify `/healthz` reports 0.2.6, refresh both browsers, and start a new room.
