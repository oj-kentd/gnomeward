Gnomeward server 0.5.0 adds merge partners for every gnome and easier merging controls.

- Every gnome has at least one listed merge partner. Four new listed forms join the original four, with seven new Blender models in total.
- Three additional secret recipes can be found by experimenting; their recipes and entries stay out of the Book of Merging.
- Compatible gnomes can merge at any upgrade level, including level zero.
- Pick a gnome from the shop and tap your compatible defender. Pay the normal gold price once; the new form stays at the existing defender’s location.
- Existing gnomes can also be dragged onto each other or merged from the unit panel, for free.
- Ownership, funds, unlocks, duplicate types, game status, and unit limits are validated before anything changes.
- Preserves abilities, upgrades, guardian queues, permanent Turbo Tumble effects, and Book of Merging discoveries.
- Includes all earlier co-op features. Server 0.4.0 still supports panel and drag merging for the original four forms; older servers remain joinable with unavailable actions clearly explained.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.5.0/docs/UNRAID.md)**

Download the image and `SHA256SUMS`, verify the checksum, and load the image with Docker. Set the container’s Repository to `gnomeward-server:0.5.0` and Apply. Keep the same data mount, port, environment variables, and Cloudflare route. Finish active games before restarting.

Verify `/healthz` reports `0.5.0` with `placementFusionVersion: 1` and `fusionCatalogVersion: 2`, refresh both browsers, and create a new room. You can update directly from any earlier release. No save migration is required.
