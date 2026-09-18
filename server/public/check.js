(() => {
  'use strict';
  const PROTOCOL = 1;
  const $ = id => document.getElementById(id);
  const mapNames = Object.fromEntries([...$('map').options].map(option => [option.value, option.text]));
  let healthy = false, busy = false, activeRoom = null, snapshot = null, dropped = false;
  let reconnectTimer = null, reconnectDeadline = 0, lastUpdate = 0;
  const client = window.Colyseus ? new Colyseus.Client(location.origin) : null;

  function notice(message, state = 'info') {
    $('notice').textContent = message;
    $('notice').dataset.state = state;
    $('notice').hidden = !message;
  }
  function controls() {
    $('create-room').disabled = $('join-room').disabled = !healthy || busy || !!activeRoom;
    $('player-name').disabled = $('map').disabled = $('mode').disabled = $('room-code').disabled = busy || !!activeRoom;
    const me = snapshot?.players.find(player => player.id === activeRoom?.sessionId);
    const planning = snapshot?.boards.length > 0 && snapshot.boards.every(board => board.state.status === 'planning');
    $('ready').disabled = !activeRoom || dropped || !planning || !!me?.ready || !!snapshot?.paused || snapshot?.players.filter(player => player.connected).length !== 2;
    $('ready').textContent = me?.ready ? 'Ready · waiting for teammate' : 'Ready for next round';
  }
  function explain(error) {
    const message = String(error?.message || error || 'Connection failed.');
    if (/protocol|version/i.test(message)) return 'The page and server use different protocol versions. Refresh this page after updating the server.';
    if (/full|locked|maxclients|seat reservation/i.test(message)) return 'This room has no available seat. Create a new room for a different pair of players.';
    if (/not found|does not exist|invalid room|404/i.test(message)) return 'That room is unavailable. Check the exact code, or ask the first player to create a new room.';
    return message;
  }
  async function checkHealth() {
    $('health-retry').disabled = true;
    $('health-status').textContent = 'Checking server…';
    try {
      const response = await fetch('/healthz', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Health check failed.');
      const health = await response.json();
      if (health.status !== 'ok' || health.service !== 'gnomeward-server') throw new Error('This address did not return a Gnomeward health check.');
      if (health.protocol !== PROTOCOL) throw new Error('Protocol version mismatch. Refresh after updating the server.');
      if (!client) throw new Error('The connection library did not load. Refresh this page.');
      const ready = await fetch('/readyz', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!ready.ok) throw new Error('The server is starting or shutting down. Try again shortly.');
      healthy = true;
      $('health-status').textContent = 'Server ready';
      $('health-status').dataset.state = 'ok';
      $('server-version').textContent = `v${health.version} · protocol ${health.protocol}`;
    } catch (error) {
      healthy = false;
      $('health-status').textContent = explain(error);
      $('health-status').dataset.state = 'error';
      $('server-version').textContent = '';
    } finally {
      $('health-retry').disabled = false;
      controls();
    }
  }
  function render(data) {
    if (data.protocol !== PROTOCOL) {
      notice('Server protocol version changed. Leave this room and refresh the page.', 'error');
      $('ready').disabled = true;
      return;
    }
    snapshot = data;
    lastUpdate = Date.now();
    $('room-details').textContent = `${data.mode === 'pvp' ? 'PvP · separate gardens' : 'Co-op · shared garden'} · ${mapNames[data.mapId] || data.mapId}`;
    $('players').replaceChildren(...data.players.map(player => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `${player.name}${player.id === activeRoom.sessionId ? ' (you)' : ''}${player.id === data.hostId ? ' · host' : ''}`;
      const detail = document.createElement('span'); detail.className = 'detail';
      detail.textContent = `${player.connected ? (player.ready ? 'Ready' : 'Connected') : 'Reconnecting'} · ${player.gold} gold · ${player.points} points`;
      li.append(name, detail); return li;
    }));
    $('boards').replaceChildren(...data.boards.map(board => {
      const card = document.createElement('div'); card.className = 'board';
      const title = document.createElement('h3');
      title.textContent = board.playerId ? `${data.players.find(player => player.id === board.playerId)?.name || 'Player'}’s garden` : 'Shared garden';
      const round = document.createElement('p'); round.className = 'round-state';
      round.textContent = `Round ${board.state.wave} · ${board.state.status}${data.paused ? ' · paused' : ''}`;
      const lives = document.createElement('p'); lives.textContent = `${board.state.lives} cottage lives`;
      const resources = document.createElement('p'); resources.textContent = `${board.state.gold} gold · ${board.state.points} upgrade points`;
      card.append(title, round, lives, resources); return card;
    }));
    if (data.result) notice('This test match has ended. Leave and create another room to check a new match.');
    controls();
    updateAge();
  }
  function updateAge() {
    if (activeRoom && lastUpdate) $('latest-update').textContent = `Latest server update: ${Math.floor((Date.now() - lastUpdate) / 1000)}s ago`;
  }
  function clearReconnect() { clearInterval(reconnectTimer); reconnectTimer = null; }
  function showLobby(message) {
    clearReconnect(); activeRoom = null; snapshot = null; dropped = false; lastUpdate = 0;
    $('room').hidden = true; $('lobby').hidden = false; busy = false;
    controls(); notice(message);
  }
  function attach(room) {
    activeRoom = room; snapshot = null; dropped = false;
    Object.assign(room.reconnection, { minUptime: 0, maxRetries: 30, minDelay: 500, maxDelay: 3000 });
    $('room-title').textContent = room.roomId;
    $('connection-status').textContent = 'Connected · WebSocket is working';
    $('connection-status').dataset.state = 'ok';
    $('lobby').hidden = true; $('room').hidden = false;
    $('players').replaceChildren(); $('boards').replaceChildren();
    room.onMessage('snapshot', data => { if (activeRoom === room) render(data); });
    room.onMessage('command-error', error => notice(explain(error), 'error'));
    room.onError((_code, message) => { if (activeRoom === room && !dropped) notice(explain({ message }), 'error'); });
    room.onDrop(() => {
      // Failed retry sockets emit onDrop again; the original 60-second window
      // must keep counting down instead of starting over with each attempt.
      if (activeRoom !== room || dropped) return;
      dropped = true; reconnectDeadline = Date.now() + 60000; clearReconnect();
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((reconnectDeadline - Date.now()) / 1000));
        $('connection-status').textContent = `Connection interrupted · reconnecting (${remaining}s left)`;
        $('connection-status').dataset.state = 'error';
        if (!remaining) {
          room.reconnection.enabled = false; room.reconnection.maxRetries = 0;
          room.connection.close();
          showLobby('Reconnection timed out. Create a new room and share its code again.');
        }
      };
      tick(); reconnectTimer = setInterval(tick, 1000); controls();
    });
    room.onReconnect(() => {
      if (activeRoom !== room) { room.leave(); return; }
      clearReconnect(); dropped = false;
      $('connection-status').textContent = 'Reconnected · WebSocket is working';
      $('connection-status').dataset.state = 'ok';
      room.send('snapshot'); controls();
    });
    room.onLeave(() => { if (activeRoom === room) showLobby('Room closed. You can create or join another test room.'); });
    room.send('snapshot'); controls();
  }
  async function connect(join) {
    if (!healthy || busy || activeRoom) return;
    const name = $('player-name').value.trim();
    if (!name) { notice('Enter a name before joining.', 'error'); $('player-name').focus(); return; }
    const roomId = $('room-code').value.trim();
    if (join && !roomId) { notice('Enter the room code from the first device.', 'error'); $('room-code').focus(); return; }
    busy = true; controls(); notice('Connecting…');
    try {
      const room = join
        ? await client.joinById(roomId, { protocol: PROTOCOL, name })
        : await client.create('gnomeward', { protocol: PROTOCOL, name, mapId: $('map').value, mode: $('mode').value });
      attach(room); notice('');
    } catch (error) { notice(explain(error), 'error'); }
    finally { busy = false; controls(); }
  }
  $('health-retry').addEventListener('click', checkHealth);
  $('create-room').addEventListener('click', () => connect(false));
  $('join-room').addEventListener('click', () => connect(true));
  $('room-code').addEventListener('keydown', event => { if (event.key === 'Enter') connect(true); });
  $('ready').addEventListener('click', () => {
    if (!activeRoom || dropped || $('ready').disabled) return;
    notice(''); activeRoom.send('command', { action: 'ready' });
  });
  $('leave').addEventListener('click', () => {
    if (!activeRoom) return;
    const room = activeRoom; room.reconnection.enabled = false; room.reconnection.maxRetries = 0;
    if (dropped) room.connection.close(); else room.leave();
    showLobby('You left the test room.');
  });
  $('copy-code').addEventListener('click', async () => {
    if (!activeRoom) return;
    try { await navigator.clipboard.writeText(activeRoom.roomId); notice('Room code copied. Share it with the second player.'); }
    catch { notice(`Copy this room code: ${activeRoom.roomId}`); }
  });
  setInterval(updateAge, 1000);
  checkHealth();
})();
