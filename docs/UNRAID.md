# Gnomeward server on Unraid

Yes: add Gnomeward as another published application on your existing Cloudflare Tunnel. Keep the existing `cloudflared` container, tunnel, token, and other routes. One tunnel can serve multiple hostnames. [Cloudflare routing documentation](https://developers.cloudflare.com/tunnel/concepts/routing/)

Server 0.2.2 supports the published game’s **Co-op** button and public lobby list. Install this update, then open the normal game in two browsers: one player creates a co-op lobby, the other joins it. The server root also retains a connection-test page. PvP gameplay is not yet connected to the main game.

The intended connections are:

```text
Game website:  gnomeward.thekents.org  → GitHub Pages (unchanged)
Game service:  multiplayer.lightsoutphotos.com → existing Cloudflare Tunnel
                                        → Unraid → gnomeward-server:2567
```

Cloudflare provides public HTTPS/WSS. The service speaks HTTP/WebSocket on the private network; it needs no local certificate, GPU, separate database, or router port forwarding. Start with roughly 1–2 CPU cores and 1–2 GB RAM available, then measure simultaneous matches and late endless rounds before increasing capacity. These are starting estimates, not measured capacity guarantees.

## 1. Create the Unraid container

### Load the published image

The release includes a tested **Linux amd64** Docker image for a typical Unraid server. Download and import it from the Unraid terminal; no GitHub registry login or package permissions are needed:

```bash
mkdir -p /mnt/user/appdata/gnomeward-install/0.2.2
cd /mnt/user/appdata/gnomeward-install/0.2.2
curl -fLO https://github.com/oj-kentd/gnomeward/releases/download/server-v0.2.2/gnomeward-server-0.2.2-linux-amd64.tar.gz
curl -fLO https://github.com/oj-kentd/gnomeward/releases/download/server-v0.2.2/SHA256SUMS
sha256sum -c SHA256SUMS
```

Continue only after the checksum reports **OK**:

```bash
docker load -i gnomeward-server-0.2.2-linux-amd64.tar.gz
docker image inspect gnomeward-server:0.2.2 --format '{{.Os}}/{{.Architecture}}'
```

The last command should print `linux/amd64`. Keep the downloaded archive for rollback, or retain the release link. The local image is named **`gnomeward-server:0.2.2`**; it is not pulled from Docker Hub or GHCR.

### Add the container in Unraid

Use **Docker → Add Container**. Switch to **Advanced View** to see Extra Parameters. Configure the following settings; use **Add another Path, Port, Variable, Label or Device** for the mappings and variables. [Unraid container settings](https://docs.unraid.net/unraid-os/using-unraid-to/run-docker-containers/managing-and-customizing-containers/)

| Setting | Value |
| --- | --- |
| Name | `gnomeward-server` |
| Repository | `gnomeward-server:0.2.2` (the image loaded above) |
| Network Type | `Bridge` |
| Privileged | Off |
| WebUI | `http://[IP]:[PORT:2567]/` |
| Port, TCP | Host `2567` → container `2567` |
| Path, read/write | Host `/mnt/user/appdata/gnomeward` → container `/data` |
| Extra Parameters | `--user 99:100 --restart unless-stopped --log-opt max-size=10m --log-opt max-file=3` |

Add these **environment variables**:

| Key | Value |
| --- | --- |
| `PORT` | `2567` |
| `HOST` | `0.0.0.0` |
| `DATA_DIR` | `/data` |
| `MAX_ROOMS` | `8` |
| `ALLOWED_ORIGINS` | `https://gnomeward.thekents.org,http://gnomeward.thekents.org,https://oj-kentd.github.io,https://multiplayer.lightsoutphotos.com` |

An origin includes the scheme and hostname, plus a port when applicable; it never includes a path or trailing slash. If you choose another service hostname, change its entry too. The local diagnostic also permits its own origin automatically, so opening it directly at the Unraid LAN address works without adding that address.

Before applying the container, create its dedicated data folder from the Unraid terminal:

```bash
mkdir -p /mnt/user/appdata/gnomeward
chown 99:100 /mnt/user/appdata/gnomeward
chmod 770 /mnt/user/appdata/gnomeward
```

The image normally runs as UID/GID `1000:1000`; the Extra Parameters above use Unraid's `99:100` instead. This image does **not** interpret `PUID` or `PGID` environment variables. Match the folder owner to the actual Docker `--user`; do not fix permission failures by enabling privileged mode. [Docker user option](https://docs.docker.com/reference/cli/docker/container/run/#user)

Select **Apply**, then enable **Autostart** for Gnomeward. Leave Post Arguments empty. If port 2567 is already occupied, change only the host port and use that port in the tunnel origin and LAN test URL.

The pinned `0.2.2` tag gives reproducible setup. Do not enable registry auto-updates for this local image; install subsequent release archives as described below. Unraid's registry update check may show an unavailable status because this image has no registry pull source.

### Optional: Compose or a source build

If you already manage containers with Compose, use [compose.unraid.yml](../deploy/compose.unraid.yml) after loading the image. Inspect its user, data path, ports, and origin list before starting it. Do not create a second instance with the Unraid Add Container screen.

For another CPU architecture, or if downloading a prebuilt image is unavailable, build the tagged source locally:

```bash
mkdir -p /mnt/user/appdata/gnomeward-source/0.2.2
cd /mnt/user/appdata/gnomeward-source/0.2.2
curl -fL https://github.com/oj-kentd/gnomeward/archive/refs/tags/server-v0.2.2.tar.gz -o source.tar.gz
tar -xzf source.tar.gz --strip-components=1
docker build -f Dockerfile.server -t gnomeward-server:0.2.2 .
```

Then use the same container settings above. The build requires Internet access for the Node base image and npm dependencies; it does not need Blender or a GPU.

## 2. Verify the service on your LAN

From a computer on your home network, open:

```text
http://YOUR_UNRAID_LAN_IP:2567/healthz
http://YOUR_UNRAID_LAN_IP:2567/readyz
http://YOUR_UNRAID_LAN_IP:2567/
```

The first two should return HTTP 200 with JSON. The root page is the connection diagnostic; create a lobby in one browser tab, then click Join beside that host in the other tab’s Open lobbies list. Both players should connect and receive state updates. Close the test room afterward. Successful health checks alone do not verify WebSockets.

If the container stops, click its icon → **Logs**. A permissions error for `/data` means the folder owner and container user do not match. Fix the dedicated Gnomeward directory, not the entire `appdata` share.

## 3. Add a hostname to your existing Cloudflare Tunnel

Use `multiplayer.lightsoutphotos.com` below, or substitute a hostname on a domain already active in your Cloudflare account. The normal Cloudflare setup requires the domain to use Cloudflare DNS. Keep the game website's existing DNS record intact. [Cloudflare prerequisites](https://developers.cloudflare.com/tunnel/get-started/)

### Dashboard-managed tunnel — the usual token-based container

If your connector runs with a tunnel token and you manage its routes in the dashboard:

1. Open the Cloudflare dashboard → **Networking → Tunnels** and select the **existing healthy tunnel** used by your Unraid connector. Older dashboard layouts may show **Zero Trust → Networks → Tunnels**.
2. Open **Routes → Add route → Published application**. Older layouts call this **Public Hostnames → Add a public hostname**.
3. Set the hostname to **`multiplayer.lightsoutphotos.com`**, with no path restriction.
4. Set the service type to **HTTP**, URL **`YOUR_UNRAID_LAN_IP:2567`** (or the full service URL `http://YOUR_UNRAID_LAN_IP:2567` if the UI has one field).
5. Save. Cloudflare creates the tunnel DNS mapping. The existing connector receives the route; no new token or connector is needed. [Published application setup](https://developers.cloudflare.com/tunnel/get-started/)

Do not enter `localhost:2567` when `cloudflared` uses bridge networking: that means the **cloudflared container itself**, not Unraid or Gnomeward. Use your Unraid LAN address. A DHCP reservation keeps that address stable.

If a DNS record already exists for this exact new hostname, inspect and replace only that conflicting record before saving. Do not change `gnomeward.thekents.org` or any other application's records.

Cloudflare handles the public certificate. Keep the private service type **HTTP**; selecting HTTPS for this HTTP server causes an origin error. There is no need to enable “No TLS Verify.”

### Alternative: shared Docker network

If both containers already use the **same user-defined Docker bridge network**, the origin can be **`http://gnomeward-server:2567`**. Docker resolves the container name on that network. It does not normally resolve it between unrelated/default bridge networks.

Use this approach if your `cloudflared` container cannot reach the Unraid host address, for example due to a custom network's host isolation. Preserve the connector's other network connections and routes; moving it to a different network can break existing applications. Persist any network change in its Unraid template so a future container update retains it. The LAN-address route is simpler when it already works.

### Locally managed tunnel — only if it reads a mounted config.yml

If the connector uses a mounted YAML file and a tunnel credentials JSON instead of dashboard routes, merge the hostname block from [cloudflared.example.yml](../deploy/cloudflared.example.yml) into its **existing** `ingress` list, before the final catch-all rule. Preserve the existing tunnel UUID, credential path, routes, and origin settings. Rules are evaluated in order; the catch-all must remain last. [Cloudflare configuration reference](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/)

Add the corresponding DNS record in Cloudflare:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `multiplayer` | `YOUR_EXISTING_TUNNEL_UUID.cfargotunnel.com` | Proxied |

Alternatively, on a machine already authenticated to Cloudflare with its account `cert.pem`, run:

```bash
cloudflared tunnel route dns YOUR_EXISTING_TUNNEL_UUID multiplayer.lightsoutphotos.com
```

The tunnel's runtime token/credentials alone do not grant this DNS-management command. You can use the dashboard instead; do not copy account credentials into the game container. [Locally managed tunnel setup](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/)

Validate the edited file using your existing config path, then restart the existing connector to load it:

```bash
cloudflared tunnel --config /path/to/config.yml ingress validate
```

A connector restart briefly interrupts its other applications and existing WebSocket connections. Dashboard-managed tunnels do not need this YAML procedure.

## 4. Verify the public connection

Open these URLs from outside your LAN, such as a phone using cellular data:

```text
https://multiplayer.lightsoutphotos.com/healthz
https://multiplayer.lightsoutphotos.com/readyz
https://multiplayer.lightsoutphotos.com/
```

Repeat the two-tab connection test on the public root page. Both tabs must receive room updates. This exercises secure WebSockets through the tunnel; a working HTML page alone is insufficient. The game client uses the backend address `wss://multiplayer.lightsoutphotos.com`.

Cloudflare supports WebSockets on all plans. If disabled for this domain, turn on **Network → WebSockets**. No TCP/UDP tunnel mode or special port forwarding is required. [Cloudflare WebSocket support](https://developers.cloudflare.com/network/websockets/)

Keep this dedicated game hostname reachable without an interactive Cloudflare Access login for the current client. A login redirect or bot challenge cannot be completed by a browser's WebSocket handshake. Existing Access protections for your other applications should remain in place. If an existing wildcard Access application covers this hostname, use a deliberate hostname-specific policy or another hostname; do not broadly disable Access. Open lobbies are intentionally public, with no accounts or passwords. [Cloudflare cross-origin Access behavior](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/)

## Updates, saved data, and recovery

- **One server instance:** rooms and live simulations are in memory. Do not run multiple replicas behind one hostname until shared room routing/storage is implemented.
- **Restarts end matches:** wait until players finish before updating Gnomeward or its tunnel. Automatic container updates can interrupt matches. Persisted match results live in `/data/results.json`, retaining up to 1,000 results; a mounted folder does not restore an in-progress match after a reboot. There are no server accounts. Completing Strawberry Fields also saves a shared party unlock in this file, retained independently of the rolling match history.
- **Updates:** record the current image tag and back up the data directory. Download the next release archive and its `SHA256SUMS` into a new version directory, verify the checksum, then use `docker load -i` as above. Change the Unraid Repository field to the newly loaded version tag and select Apply. Verify `/readyz` and the connection diagnostic afterward. Do not use a registry pull/update action for the local image.
- **Rollback:** restore the prior image tag, and restore its matching data backup if a future release changes the data format. Keep `/mnt/user/appdata/gnomeward` mounted at `/data`.
- **Backups:** include this dedicated folder and your Unraid container template in your normal backups. Stop Gnomeward briefly for a consistent copy. Browser solo unlocks/high scores remain in each browser. The Strawberry Fields reward is earned on the server and shared across later co-op rooms; browser saves cannot grant server rewards.
- **Connection limits:** the HTTP matchmaking limit is 120 requests per minute per direct connection IP. Clients behind the same Cloudflare connector share this budget. This is intended for the family playtest; it is separate from each player’s game-command limit.
- **Capacity:** watch CPU, memory, logs, and home upload bandwidth. `MAX_ROOMS=8` is an admission limit, not a promise that eight late-game matches fit your hardware. Start with a couple of rooms and reduce the limit if simulation updates lag.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| LAN health check fails | Container running, host port mapping, `/data` ownership, correct LAN address, `HOST=0.0.0.0`. |
| Cloudflare 502; LAN check works | Wrong origin address/port, HTTPS selected for an HTTP origin, or connector cannot reach the host. Check the connector's Logs. Use the shared-network option when host isolation applies. |
| Cloudflare 1033 | Existing tunnel has no healthy connector; inspect `cloudflared` rather than changing the game container. |
| Server returns 403 for the browser | Add the browser's exact origin to `ALLOWED_ORIGINS`, then apply/restart Gnomeward. Do not use `*`. |
| Health works; room connection fails | Test from the diagnostic page, inspect WebSocket network errors, verify the domain's WebSockets setting, origin allowlist, and any Access/WAF challenge. |
| LAN diagnostic works; public one fails | Include `https://multiplayer.lightsoutphotos.com` in the allowlist; check public DNS and tunnel route. |
| Stale diagnostic/API responses | Exclude the service hostname from any custom “Cache Everything” rule. It carries live state and should not be cached. |
| Connection drops during maintenance | Server/connector updates end connections; active rooms do not survive a server restart. |
| Unraid tries to pull an image and fails | Load the release archive first. The Repository field must exactly match the imported local tag, `gnomeward-server:0.2.2`. This image is not on Docker Hub. |
| Release download returns 404 or checksum fails | Check the release version and asset names. Do not import a failed download; retry the download or build from the tagged source. |

For origin reachability errors, see [Cloudflare's troubleshooting reference](https://developers.cloudflare.com/tunnel/troubleshooting/). Do not expose the Unraid management UI or Docker socket through the game route.

## Play co-op in the main game

After updating the container, open the usual Gnomeward playtest and select **Co-op**. Enter a nickname, select a map, and choose **Create garden**. The second player opens Co-op and clicks **Join** beside the host. Place your gnomes and have both players press **Ready**. Each player starts with 325 gold. Only owners can upgrade, sell, or retarget their units; lives are shared.

A dropped connection pauses the garden for up to 60 seconds. Keep the tab open, or reload promptly to resume using the same browser tab’s saved session. Leaving ends the co-op run for both players and restores your paused solo garden. The game’s main menu exposes co-op only; PvP remains a diagnostic/backend feature.
