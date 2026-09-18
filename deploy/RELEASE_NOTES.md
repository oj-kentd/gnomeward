Gnomeward 0.2.4 adds clearer team readiness and shared automatic rounds. The server image is packaged for Unraid (Linux amd64).

- Your Ready button glows when your teammate is waiting. Compact status indicators show each player’s readiness on desktop and phone.
- Click your Ready check again to return to building. Both Ready votes start the next round immediately.
- Either player can enable shared auto rounds. Round one still needs both Ready votes; later rounds start after a visible five-second build countdown.
- The countdown uses real seconds, even at 2× or 3× game speed. Pausing or disconnecting freezes it. Either player can turn auto off to cancel the countdown; both Ready votes can skip the wait.
- Auto never skips the campaign victory screen or the shared choice to continue into endless mode. Existing saves, Soul Echoes rewards, and smooth co-op movement remain supported.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.2.4/docs/UNRAID.md)**

Download the 0.2.4 image and `SHA256SUMS`, verify the checksum, then load the image with Docker. Set the Unraid container’s Repository to `gnomeward-server:0.2.4` and Apply. Keep the existing data mount, port, environment variables, and Cloudflare route. Finish active games before restarting the container.

After updating, verify `/healthz` reports 0.2.4 and refresh both game browsers. Readiness highlighting works with older servers, but shared auto rounds and changing an existing Ready vote require server 0.2.4. The normal Co-op screen remains the place to create and join games.
