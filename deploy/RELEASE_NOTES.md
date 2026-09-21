Gnomeward 0.3.4 adds two permanent Round Coin costumes.

- Orange Knight Bramble wears an orange knight helmet and tunic while keeping his explosive attacks.
- Skeleton Sprout wears a skull mask and bone costume. His description: “skeleton vs skeletons who wins ???”.
- Each costs 100 Round Coins. Buy once, equip independently, or restore the original appearance for free.
- Existing coins, purchases, Morrow’s costume, and the permanent boss-damage upgrade are preserved.
- Co-op shows each player’s selected costumes on their own gnomes. Choose costumes before joining; room loadouts remain fixed.
- Older servers remain joinable with the original Bramble/Sprout appearances until updated.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.3.4/docs/UNRAID.md)**

Download the image and `SHA256SUMS`, verify the checksum, then load it with Docker. Set the container’s Repository to `gnomeward-server:0.3.4` and Apply. Keep the same data mount, port, environment variables, and Cloudflare route. Finish active games before restarting.

Verify `/healthz` reports 0.3.4 and `costumeVersion: 1`, refresh both browsers, and start a new room. You can update directly from an older release. Browser collections do not require a server data migration.
