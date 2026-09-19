Gnomeward 0.2.10 adds discoverable endless-mode enemies, combo activation indicators, and a clearer battlefield layout.

- Three enemy traits appear gradually after the campaign. Each has one weakness (2× damage) and one resistance (½ damage). Discovered traits are recorded in the field guide; skeleton colors still indicate toughness.
- Upgrade controls dock beside a larger table. A shallow desktop HUD and compact shop reclaim battlefield space while keeping controls off the map.
- The field guide stays stable while scrolling and when a new enemy is discovered.
- Both participating gnomes glow after the interaction fires. Indicators fade after three seconds and refresh on another activation.
- Indicators reveal nothing before a combination actually happens. Recipes remain absent from upgrade panels, the field guide, and discovery messages.
- Co-op uses the server’s activation state, so both players see the same participants.
- Includes the third hidden interaction and the one-completed-path-per-character requirements from the previous releases.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.2.10/docs/UNRAID.md)**

Download the image and `SHA256SUMS`, verify the checksum, then load it with Docker. Set the Unraid container’s Repository to `gnomeward-server:0.2.10` and Apply. Keep the same data mount, port, environment variables, and Cloudflare route. Finish active games before restarting.

Verify `/healthz` reports 0.2.10, refresh both browsers, and start a new room. You can update directly from an older release.
