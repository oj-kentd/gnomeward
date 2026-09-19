import { MAPS, TOWERS, ENEMIES, NECRO_PATH_SECRET } from './data.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (value) => Math.round(Number(value) || 0).toLocaleString();
const wallet = (value) => (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumSignificantDigits: 3 });
const precise = (value) => Number(value).toFixed(1).replace(/\.0$/, '');
const portrait = (type) => `<img class="portrait" src="${import.meta.env.BASE_URL}assets/${type}.png" alt="" draggable="false">`;
const icons = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3.4 12.4C-2 6.9 5.7.1 12 6.3 18.3.1 26 6.9 20.6 12.4Z"/></svg>',
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v12m3-10h-5a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3C8 1 2 7 4 15s15 8 17-12Z"/><path d="M3 22 16 9" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
};
const targetingNames = { first: 'First', last: 'Last', strong: 'Strong', close: 'Close' };
const targetingHints = { first: 'Closest to the exit', last: 'Closest to the entrance', strong: 'Highest maximum health', close: 'Nearest to this gnome' };

function mapRouteInfo(map) {
  const paths = map?.paths?.length ? map.paths : [map?.path];
  const entrances = Math.max(1, new Set(paths.filter((path) => path?.length).map((path) => JSON.stringify(path[0]))).size);
  const raw = String(map?.topology || (entrances > 1 ? 'Two entrances' : 'Winding')).replace(/[-_]/g, ' ');
  const topology = raw.charAt(0).toUpperCase() + raw.slice(1);
  return { topology, entrances };
}

function mapFacts(map) {
  const { topology, entrances } = mapRouteInfo(map);
  const countAlreadyShown = /(?:two|2)\s+entrances/i.test(topology) && entrances === 2;
  return `<div class="map-facts"><span class="map-topology">${esc(topology)}</span>${entrances > 1 && !countAlreadyShown ? `<span class="map-entrances">${entrances} entrances</span>` : ''}</div>`;
}

function upgradeBenefit(game, tower, index, stats) {
  const levels = [...tower.levels];
  levels[index]++;
  const next = game.getStats({ ...tower, levels });
  const labels = [
    ['damage', 'Damage'], ['shots', 'Targets'], ['attackSpeed', 'Attacks/s'],
    ['poisonDps', 'Poison/s'], ['poisonDuration', 'Poison seconds'], ['slowDuration', 'Slow seconds'],
    ['explosionDamage', 'Blast damage'], ['explosionRadius', 'Blast radius'], ['range', 'Range'],
    ['charges', 'Mushroom hits'], ['trapRadius', 'Mushroom radius'],
    ['poisonSpreadRadius', 'Spread radius'], ['poisonSpreadTargets', 'Spread targets'],
    ['gravityDps', 'Gravity/s'], ['pullSpeed', 'Pull speed'], ['holeDuration', 'Hole seconds'], ['holeRadius', 'Hole radius'],
    ['barrierHp', 'Barrier HP'], ['barrierLifetime', 'Barrier seconds'], ['barrierLimit', 'Max barriers'],
    ['allyHp', 'New helper HP'], ['allyDamage', 'New helper damage'], ['allySpeed', 'New march speed'], ['allyLimit', 'Helper limit'],
    ['summonCount', 'Guardians per spell kill'],
    ['seedCount', 'Seeds'], ['seedDamage', 'Seed damage'], ['seedPierce', 'Targets per seed'], ['seedRange', 'Seed reach'],
  ];
  const terrain = ['gravity', 'crystal'].includes(tower.type);
  const benefits = labels.filter(([key]) => !(terrain && key === 'attackSpeed') && Number.isFinite(next[key]) && next[key] > (stats[key] || 0) + .001)
    .map(([key, label]) => `${label} ${precise(stats[key] || 0)} → ${precise(next[key])}`);
  if (terrain && Number.isFinite(next.interval) && Math.abs(next.interval - stats.interval) > .001) {
    benefits.push(`Cooldown ${precise(stats.interval)}s → ${precise(next.interval)}s`);
  }
  if (tower.type === 'necro' && Number.isFinite(next.summonInterval) && Math.abs(next.summonInterval - stats.summonInterval) > .001) {
    benefits.push(`Dispatch ${precise(stats.summonInterval)}s → ${precise(next.summonInterval)}s`);
  }
  if (next.poisonSpreadRadius > 0 && !(stats.poisonSpreadRadius > 0)) benefits.unshift('Poison spreads to nearby skeletons');
  if (next.capture && !stats.capture) benefits.push('Captures enemies in the hole');
  if (tower.type === 'strawberry' && next.flightDuration < stats.flightDuration) benefits.push(`Flight ${precise(stats.flightDuration)}s → ${precise(next.flightDuration)}s`);
  const path = TOWERS[tower.type].paths[index];
  if (levels[index] === path.costs.length && path.finalTierHint) benefits.push(path.finalTierHint);
  return benefits.join(' · ') || path.description;
}

function comboNote(game, tower, multiplayer) {
  if (!tower) return '';
  if (multiplayer && !multiplayer.combosSupported && ['spore', 'boom', 'multi', 'crystal'].includes(tower.type)) return '<div class="combo-note" data-combo="unavailable"><strong>Late-game pairings</strong><span>Update server to 0.2.5 for combos.</span></div>';
  if (tower.type === 'spore' || tower.type === 'boom') {
    return '<div class="combo-note" data-combo="sporefire"><strong>Sporefire pairing</strong><span>Morel: Potent Spores 3 + Wild Garden 3. Bramble: Big Bang 3. Overlap their coverage so Bramble can hit poisoned skeletons.</span></div>';
  }
  if (tower.type !== 'multi' && tower.type !== 'crystal') return '';
  const maxPrism = unit => unit.type === 'crystal' && (unit.levels?.[0] || 0) >= 3 && (unit.levels?.[1] || 0) >= 3;
  const maxTumble = unit => unit.type === 'multi' && (unit.levels?.[0] || 0) >= 3;
  const pair = tower.type === 'multi' ? maxPrism : maxTumble;
  const upgraded = tower.type === 'multi' ? maxTumble(tower) : maxPrism(tower);
  const active = upgraded && game.towers.some(unit => pair(unit) && Math.hypot(unit.x - tower.x, unit.z - tower.z) <= 7);
  return `<div class="combo-note ${active ? 'combo-active' : ''}" data-combo="prismstorm" data-active="${active}"><strong>Prismstorm ${active ? 'active ✓' : 'pairing'}</strong><span>${active ? 'Tumble gains periodic homing, ricocheting crystal volleys. Prism’s aura works even without a barrier on the trail.' : 'Tumble: Whirling Wonders 3. Prism: Diamond Walls 3 + Shattering Light 3. Keep the two gnomes within 7 range.'}</span></div>`;
}

function cottageClueSignature(game) {
  return JSON.stringify([game?.isUnlocked('necro'), game?.necroSpellKills || 0, game?.profile?.pathUnlocks]);
}

function summonCounts(game, tower) {
  return {
    active: (game.allies || []).filter((ally) => ally.sourceId === tower.id && ally.hp > 0 && ally.ttl > 0).length,
    waiting: tower.soulQueue?.length || 0,
  };
}

export class UI {
  constructor(actions) {
    this.actions = actions;
    this.last = null;
    this.panelSignature = '';
    this.rosterSignature = '';
    this.previewSignature = '';
    this.selectedTowerId = null;
    this.resultShown = '';
    this.modalType = null;
    document.querySelector('#app').innerHTML = `
      <div class="game-shell">
        <header class="topbar">
          <div class="resource-panel">
            <div class="hud" aria-label="Game resources">
              <div class="hud-stat hearts" title="Lives remaining">${icons.heart}<span><strong id="hud-lives">100</strong><small>Lives</small></span></div>
              <div class="hud-stat coins" title="Gold buys new gnomes">${icons.coin}<span><strong id="hud-gold">650</strong><small>Gold</small></span></div>
              <div class="hud-stat points" title="Points buy upgrades">${icons.leaf}<span><strong id="hud-points">0</strong><small>Points</small></span></div>
            </div>
            <div class="field-toolbar"><span class="brand">GNOMEWARD</span><button class="coop-button" id="coop-button" aria-haspopup="dialog">Co-op</button><button class="map-picker" id="map-button" title="Choose a map"><span id="map-name">Mossy Meadow</span> <span aria-hidden="true">▾</span></button></div>
            <div class="coop-status" id="coop-status" role="status" hidden></div>
          </div>
          <div class="round-tools"><div class="wave-count"><small id="hud-round-label">ROUND</small><strong id="hud-wave">1<span>/20</span></strong><small class="round-best" id="hud-best" hidden></small></div><button class="icon-button" id="help-button" aria-label="Settings and how to play" title="Settings and how to play">☰</button></div>
        </header>
        <main class="game-main">
          <section class="field" aria-label="Garden battlefield">
            <div class="board-wrap">
              <div id="scene" aria-label="Garden battlefield. Choose a gnome below, then click clear ground to place it." role="application" tabindex="0"></div>
              <div class="loading-card" id="loading-card"><span class="loading-dot"></span><strong>Growing your garden…</strong><small id="loading-message">Gathering the guardians</small></div>
              <div class="round-preview" id="round-preview"><strong id="preview-title">NEXT ROUND</strong><div id="preview-enemies"></div></div>
              <div class="welcome-tip" id="welcome-tip"><button id="dismiss-tip" aria-label="Dismiss welcome tip">×</button><h1>Protect your garden!</h1><p>Pick a gnome below, then place it beside the path.</p><small>Click any planted gnome to upgrade it.</small></div>
              <div class="placement-banner" id="placement-banner" hidden><span id="placement-text"></span><button id="cancel-placement">Cancel <kbd>Esc</kbd></button></div>
              <div id="round-announcement" class="round-announcement" aria-live="polite" hidden></div>
              <section class="selection-panel floating-upgrades" id="selection-panel" aria-label="Selected defender" hidden></section>
            </div>
            <footer class="battle-controls">
              <div class="coop-readiness" id="coop-readiness" aria-label="Team readiness" hidden></div>
              <div class="battle-status"><span class="status-dot" id="status-dot"></span><strong id="status-title">Ready to defend!</strong><small id="status-detail">Place a gnome to get started.</small></div>
              <button class="start-button" id="start-button"><span class="play-triangle" aria-hidden="true">▶</span><span id="start-label">START ROUND 1</span></button>
              <div class="play-controls"><button class="control-button" id="pause-button" aria-label="Pause game" title="Pause / resume">Ⅱ</button><button class="control-button" id="speed-button" aria-label="Change game speed" title="Change game speed">1×</button><button class="control-button" id="sound-button" aria-label="Audio settings" title="Audio settings" aria-haspopup="dialog">♪</button></div>
              <button class="auto-button" id="auto-button" aria-pressed="false"><span class="toggle-check" aria-hidden="true"></span><span id="auto-label">Auto rounds: off</span><span class="auto-progress" id="auto-progress" aria-hidden="true" hidden></span></button>
            </footer>
            <section class="guardian-dock" aria-label="Choose a gnome to plant">
              <div class="dock-heading"><h2>GNOME SHOP</h2><span>Choose a guardian</span><button id="shop-toggle" aria-expanded="true" aria-controls="shop-slider">Hide ▾</button></div>
              <div class="dock-slider" id="shop-slider"><button class="roster-arrow" id="roster-previous" aria-label="Previous gnomes">‹</button><div class="roster" id="roster" aria-label="Gnome collection"></div><button class="roster-arrow" id="roster-next" aria-label="Next gnomes">›</button></div>
            </section>
          </section>
        </main>
        <div class="toast-stack" id="toast-stack" aria-live="polite"></div>
        <dialog id="game-dialog" class="game-dialog"><div id="dialog-content"></div></dialog>
      </div>`;
    const click = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    click('start-button', () => {
      if (this.last?.game.status === 'won') this.showResult(this.last.game);
      else actions.onStartWave?.();
    });
    click('pause-button', () => actions.onPause?.());
    click('speed-button', () => actions.onSpeed?.());
    click('sound-button', () => this.showHelp('music'));
    click('auto-button', () => actions.onAuto?.());
    click('cancel-placement', () => actions.onCancel?.());
    click('dismiss-tip', () => this.dismissTip());
    click('map-button', () => this.showMaps());
    click('coop-button', () => actions.onCoopOpen?.());
    click('help-button', () => this.showHelp());
    click('shop-toggle', () => {
      const collapsed = document.querySelector('.game-shell').classList.toggle('shop-collapsed');
      document.getElementById('shop-slider').hidden = collapsed;
      const toggle = document.getElementById('shop-toggle');
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.textContent = collapsed ? 'Show ▴' : 'Hide ▾';
      if (this.last) this.update(this.last.game, this.last.state);
    });
    const slideRoster = (direction) => {
      const roster = document.getElementById('roster');
      roster.scrollBy({ left: direction * Math.max(130, roster.clientWidth * .7), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    };
    click('roster-previous', () => slideRoster(-1));
    click('roster-next', () => slideRoster(1));
    document.getElementById('roster').addEventListener('click', (event) => {
      const card = event.target.closest('[data-tower]');
      if (!card || card.disabled) return;
      this.dismissTip();
      actions.onChooseTower?.(card.dataset.tower);
    });
    document.getElementById('selection-panel').addEventListener('click', (event) => {
      const upgrade = event.target.closest('[data-upgrade]');
      if (upgrade && !upgrade.disabled) actions.onUpgrade?.(Number(upgrade.dataset.upgrade));
      if (event.target.closest('[data-sell]:not(:disabled)')) actions.onSell?.();
      if (event.target.closest('[data-targeting]:not(:disabled)')) actions.onTargeting?.();
      if (event.target.closest('[data-close-upgrades]')) actions.onCancel?.();
    });
    this.dialog = document.getElementById('game-dialog');
    this.dialog.addEventListener('click', (event) => { if (event.target === this.dialog) this.closeModal(); });
    this.dialog.addEventListener('close', () => { this.modalType = null; });
    document.getElementById('dialog-content').addEventListener('click', (event) => {
      if (event.target.closest('button:disabled')) return;
      if (event.target.closest('[data-coop-refresh]')) actions.onCoopRefresh?.();
      if (event.target.closest('[data-coop-leave]')) { this.closeModal(); actions.onCoopLeave?.(); }
      const name = () => document.getElementById('coop-name')?.value.trim() || 'Gardener';
      if (event.target.closest('[data-coop-create]')) actions.onCoopCreate?.({ name: name(), mapId: document.getElementById('coop-map').value });
      const join = event.target.closest('[data-coop-join]');
      if (join) actions.onCoopJoin?.({ name: name(), roomId: join.dataset.coopJoin });
      if (event.target.closest('[data-close]')) this.closeModal();
      const map = event.target.closest('[data-map]');
      if (map) { this.closeModal(); this.resultShown = ''; actions.onMap?.(map.dataset.map); }
      if (event.target.closest('[data-continue-endless]')) { if (!this.last?.state.multiplayer) this.closeModal(); actions.onContinueEndless?.(); }
      if (event.target.closest('[data-restart]')) { this.closeModal(); this.resultShown = ''; actions.onRestart?.(); }
      if (event.target.closest('[data-maps]')) this.showMaps();
      const music = event.target.closest('[data-music]');
      if (music) {
        actions.onMusic?.(music.dataset.music);
        this.syncAudioSettings(this.last?.state || {});
      }
      const setting = event.target.closest('[data-setting]');
      if (setting) {
        ({ pause: actions.onPause, sound: actions.onSound, auto: actions.onAuto })[setting.dataset.setting]?.();
        this.syncAudioSettings(this.last?.state || {});
      }
    });
    document.getElementById('dialog-content').addEventListener('input', (event) => {
      if (event.target.id !== 'music-volume') return;
      actions.onMusicVolume?.(Number(event.target.value) / 100);
      this.syncAudioSettings(this.last?.state || {});
    });
  }

  dismissTip() { document.getElementById('welcome-tip').hidden = true; }
  setLoading(value) {
    const loading = document.getElementById('loading-card');
    loading.hidden = value == null || value === false || value === 1 || value === 100 || value === 'ready';
    if (!loading.hidden) document.getElementById('loading-message').textContent = typeof value === 'string' ? value : 'Bringing the garden to life';
    document.dispatchEvent(new CustomEvent('gnomeward-loading', { detail: { ready: loading.hidden, message: document.getElementById('loading-message').textContent } }));
  }

  update(game, state = {}) {
    this.last = { game, state };
    if (this.modalType === 'clue' && this.clueSignature !== cottageClueSignature(game)) this.showCottageClue();
    const multiplayer = state.multiplayer;
    const players = multiplayer?.players || [];
    const me = players.find((player) => player.id === multiplayer?.sessionId);
    const ready = multiplayer?.ready ?? me?.ready;
    const teammate = players.find((player) => player.id !== multiplayer?.sessionId);
    const together = !!multiplayer?.connected && players.length === 2 && players.every((player) => player.connected);
    const set = (id, text) => { const element = document.getElementById(id); if (element.textContent !== text) element.textContent = text; };
    const map = typeof game.map === 'string' ? MAPS.find((m) => m.id === game.map) : game.map;
    const inWave = game.status === 'wave';
    const finished = ['won', 'lost'].includes(game.status);
    const won = game.status === 'won';
    const upcoming = game.endless ? Number(game.wave || 0) + 1 : Math.min(game.maxWaves || 20, Number(game.wave || 0) + 1);
    const displayedRound = inWave || finished ? game.wave : upcoming;
    const currency = multiplayer ? wallet : n;
    set('hud-lives', n(game.lives));
    for (const [key, label] of [['gold', 'gold'], ['points', 'upgrade points']]) {
      set(`hud-${key}`, game[key] >= 10000 ? compactNumber.format(game[key]) : currency(game[key]));
      const counter = document.getElementById(`hud-${key}`);
      counter.title = `${currency(game[key])} ${label}`;
      counter.setAttribute('aria-label', counter.title);
    }
    document.getElementById('hud-wave').innerHTML = `${displayedRound}<span>/${game.endless ? '∞' : game.maxWaves || 20}</span>`;
    set('hud-round-label', game.endless ? 'ENDLESS' : 'ROUND');
    const best = document.getElementById('hud-best');
    best.hidden = !game.endless;
    best.textContent = `BEST ${n(game.bestRound)}`;
    best.title = 'Highest round survived in this garden';
    set('map-name', map?.name || MAPS[0].name);
    const routeInfo = mapRouteInfo(map);
    document.getElementById('map-button').title = `${map?.name || MAPS[0].name} · ${routeInfo.topology} · ${routeInfo.entrances} ${routeInfo.entrances === 1 ? 'entrance' : 'entrances'} · Choose a map`;
    const start = document.getElementById('start-button');
    const yourTurn = !!multiplayer && together && !multiplayer.paused && !multiplayer.result && !inWave && !finished && !!teammate?.ready && !ready;
    start.classList.toggle('teammate-ready', yourTurn);
    if (multiplayer && !inWave && !finished && !multiplayer.result) start.setAttribute('aria-pressed', String(!!ready));
    else start.removeAttribute('aria-pressed');
    start.disabled = game.status === 'lost';
    start.classList.toggle('fast-forward', inWave);
    start.innerHTML = `<span class="play-triangle" aria-hidden="true">${inWave && !state.paused ? '▶▶' : '▶'}</span><span>${won ? 'CONTINUE ∞' : finished ? 'FINISHED' : inWave && state.paused ? 'RESUME' : inWave ? `SPEED ${state.speed || 1}×` : `START ROUND ${upcoming}`}</span>`;
    start.setAttribute('aria-label', won ? 'Continue in endless mode' : finished ? 'Game finished' : inWave && state.paused ? 'Resume round' : inWave ? `Change speed, currently ${state.speed || 1}×` : `Start round ${upcoming}`);
    start.title = won ? 'Choose to continue in endless mode' : inWave && state.paused ? 'Resume the round' : inWave ? 'Click to cycle game speed' : 'Send the next round';
    if (multiplayer) {
      const host = multiplayer.hostId === multiplayer.sessionId;
      const label = multiplayer.result ? 'MATCH FINISHED' : won ? 'CONTINUE ∞' : finished ? 'FINISHED' : inWave ? multiplayer.manualPause ? 'RESUME' : host ? `SPEED ${state.speed || 1}×` : 'ROUND IN PROGRESS' : ready ? 'READY ✓' : state.autoStart && state.autoCountdown != null ? 'READY NOW' : 'READY';
      start.innerHTML = `<span class="play-triangle" aria-hidden="true">${ready ? '✓' : '▶'}</span><span>${label}</span>`;
      start.disabled = !!multiplayer.result || game.status === 'lost' || !together || (inWave ? !multiplayer.manualPause && !host : !won && ((!multiplayer.autoSupported && !!ready) || multiplayer.paused));
      start.setAttribute('aria-label', !inWave && ready ? multiplayer.autoSupported ? 'You are ready. Waiting for your teammate. Click to change back to building.' : 'You are ready. Waiting for your teammate.' : yourTurn ? `${teammate.name} is ready. Your turn to ready up.` : label);
      start.title = inWave ? 'The host controls game speed; either player can pause.' : ready && !multiplayer.autoSupported ? 'Waiting for your teammate. Update the server to 0.2.4 to change readiness and use shared auto rounds.' : ready ? 'Click to return to building. Turn shared auto off to hold the next round.' : state.autoStart ? 'Both players ready starts immediately. Turn shared auto off to hold the next round.' : 'Both players must be ready to start the next round.';
    }
    const countdown = state.autoStart && state.autoCountdown != null && !inWave && !finished;
    set('status-title', finished ? game.status === 'won' ? 'VICTORY!' : 'Garden overrun' : state.paused ? 'PAUSED' : countdown ? `Next round in ${Math.ceil(state.autoCountdown)}s` : inWave ? 'Defend the garden!' : 'Ready for the next round?');
    set('status-detail', won ? 'Keep your garden growing in endless mode.' : game.status === 'lost' ? `Survived round ${n(game.completedWaves)} · Best ${n(game.bestRound)}` : inWave ? `${game.enemies?.length || 0} skeletons on the path` : 'Build and upgrade before starting.');
    document.getElementById('status-dot').classList.toggle('active', inWave && !state.paused);
    set('speed-button', `${state.speed || 1}×`);
    set('pause-button', state.paused ? '▶' : 'Ⅱ');
    document.getElementById('pause-button').setAttribute('aria-label', state.paused ? 'Resume game' : 'Pause game');
    document.getElementById('pause-button').setAttribute('aria-pressed', String(!!state.paused));
    document.getElementById('sound-button').dataset.musicActive = String(state.music && state.music !== 'off');
    this.syncAudioSettings(state);
    document.getElementById('auto-button').setAttribute('aria-pressed', String(!!state.autoStart));
    set('auto-label', countdown && !state.paused ? `Next round in ${Math.ceil(state.autoCountdown)}s` : `Auto rounds: ${state.autoStart ? 'on' : 'off'}`);
    document.getElementById('map-button').disabled = !!multiplayer;
    document.getElementById('speed-button').disabled = !!multiplayer && (multiplayer.hostId !== multiplayer.sessionId || !together || !!multiplayer.result);
    document.getElementById('pause-button').disabled = !!multiplayer && (!together || !!multiplayer.result);
    const auto = document.getElementById('auto-button');
    auto.hidden = false;
    auto.disabled = !!multiplayer && (!multiplayer.autoSupported || !multiplayer.connected || multiplayer.reconnecting || !!multiplayer.result);
    auto.title = multiplayer && !multiplayer.autoSupported ? 'Update the server to 0.2.4 for shared auto rounds.' : multiplayer ? 'Shared by both players. Either player can switch this off to hold the next round.' : 'Automatically start the next round after a short break.';
    if (multiplayer) set('auto-label', !multiplayer.autoSupported ? 'Auto: server update' : countdown ? `${state.paused || !together ? 'Held' : 'Next'} · ${Math.ceil(state.autoCountdown)}s` : `Shared auto: ${state.autoStart ? 'on' : 'off'}`);
    const autoProgress = document.getElementById('auto-progress');
    autoProgress.hidden = !multiplayer || !countdown;
    autoProgress.style.transform = `scaleX(${Math.max(0, Math.min(1, (state.autoCountdown || 0) / 5))})`;
    const readiness = document.getElementById('coop-readiness');
    readiness.hidden = !multiplayer;
    if (multiplayer) {
      const chip = (player, mine = false) => {
        const isReady = mine ? ready : player?.ready;
        const status = multiplayer.result || finished ? 'Finished' : !player ? 'Open seat' : !player.connected ? 'Reconnecting' : inWave ? 'Defending' : isReady ? 'Ready ✓' : mine && yourTurn ? 'Your turn!' : 'Building';
        return `<span class="readiness-player ${isReady && !inWave && !finished && !multiplayer.result ? 'is-ready' : ''} ${mine && yourTurn ? 'is-your-turn' : ''}" title="${esc(player?.name || 'Teammate')}: ${status}"><b>${mine ? 'You' : esc(player?.name || 'Teammate')}</b><small>${status}</small></span>`;
      };
      const markup = chip(me, true) + chip(teammate);
      if (readiness.innerHTML !== markup) readiness.innerHTML = markup;
    }
    document.querySelector('.game-shell').classList.toggle('is-coop', !!multiplayer);
    set('coop-button', multiplayer ? 'Co-op · Room' : 'Co-op');
    const coopStatus = document.getElementById('coop-status');
    coopStatus.hidden = !multiplayer;
    if (multiplayer) {
      const connection = multiplayer.reconnecting || !multiplayer.connected ? 'Reconnecting… garden paused' : !teammate ? 'Lobby open · waiting for a teammate' : !teammate.connected ? `${teammate.name} disconnected · garden paused` : `${teammate.name} · ${inWave ? 'defending together' : teammate.ready ? 'ready ✓' : 'building'}`;
      if (coopStatus.textContent !== connection) coopStatus.textContent = connection;
      coopStatus.dataset.connection = together ? 'connected' : 'waiting';
      document.querySelector('.coins small').textContent = 'Your gold';
      document.querySelector('.points small').textContent = 'Your points';
      if (!finished) {
        set('status-title', multiplayer.result ? 'Match ended' : !together ? 'Waiting for teammate' : multiplayer.manualPause ? 'GARDEN PAUSED' : inWave ? 'Defend together!' : countdown ? `Next round in ${Math.ceil(state.autoCountdown)}s` : yourTurn ? `${teammate.name} is ready!` : ready ? 'You’re ready ✓' : 'Build, then press Ready');
        set('status-detail', inWave && together ? `${game.enemies?.length || 0} skeletons on the path` : countdown ? 'Ready together to start now · auto off to hold.' : yourTurn ? 'Your turn — press Ready when you’re set.' : ready ? 'Waiting for your teammate to get ready.' : 'Shared lives · your own gold & points');
      }
      this.syncCoopRoom(multiplayer);
    } else {
      document.querySelector('.coins small').textContent = 'Gold';
      document.querySelector('.points small').textContent = 'Points';
    }
    const next = typeof game.nextWaveInfo === 'function' ? game.nextWaveInfo() : null;
    document.getElementById('round-preview').hidden = inWave || finished;
    const previewSignature = JSON.stringify([upcoming, next?.counts]);
    if (previewSignature !== this.previewSignature) {
      this.previewSignature = previewSignature;
      set('preview-title', next?.boss ? `BOSS ROUND ${upcoming}` : `COMING IN ROUND ${upcoming}`);
      document.getElementById('preview-enemies').innerHTML = Object.entries(next?.counts || {}).map(([type, count]) => `<span class="enemy-badge" title="${esc(ENEMIES[type]?.name || type)}: ${count}"><i style="--enemy-color:${ENEMIES[type]?.color || '#eee8cf'}"></i><b>${count}</b><span>${esc((ENEMIES[type]?.name || type).replace(' skeleton', '').replace('The ', ''))}</span></span>`).join('');
    }
    const placement = document.getElementById('placement-banner');
    placement.hidden = !state.placingType;
    if (state.placingType) set('placement-text', `Place ${TOWERS[state.placingType]?.name || 'your gnome'} · ${n(TOWERS[state.placingType]?.cost)} gold`);
    const rosterSignature = JSON.stringify([state.placingType, Object.keys(TOWERS).map((id) => [game.isUnlocked(id), game.gold >= TOWERS[id].cost])]);
    if (rosterSignature !== this.rosterSignature) {
      this.rosterSignature = rosterSignature;
      document.getElementById('roster').innerHTML = Object.entries(TOWERS).map(([id, tower]) => {
        const unlocked = game.isUnlocked(id);
        const affordable = game.gold >= tower.cost;
        const secret = !unlocked && !!tower.unlockSecret;
        const secretGarden = MAPS.find((garden) => garden.id === tower.unlockSecret)?.name || 'a hidden garden';
        const unlockGarden = MAPS.find((garden) => garden.id === tower.unlockMap)?.name;
        const hint = secret ? id === 'necro' ? `A quiet secret in ${secretGarden}.` : `Three discoveries in ${secretGarden} may reveal a hidden guardian.` : `${tower.description}${!unlocked ? unlockGarden ? ` Clear all 20 rounds of ${unlockGarden} to unlock.` : ` Beat round ${tower.unlockWave} to unlock.` : !affordable ? ' Not enough gold.' : ''}`;
        return `<button class="tower-card ${!unlocked ? 'locked' : !affordable ? 'unaffordable' : 'affordable'} ${secret ? 'secret-locked' : ''} ${state.placingType === id ? 'chosen' : ''}" data-tower="${id}" ${!unlocked || !affordable ? 'disabled' : ''} aria-pressed="${state.placingType === id}" title="${esc(hint)}" ${secret ? `aria-label="Map secret. ${esc(hint)}"` : ''}><div class="tower-art" style="--tower-color:${tower.color}">${portrait(id)}${!unlocked ? `<span class="lock-badge">${icons.lock}</span>` : ''}</div><span class="tower-info"><strong>${secret ? '???' : esc(tower.name)}</strong><span class="tower-cost">${unlocked ? `${icons.coin}${n(tower.cost)}` : secret ? 'Map secret' : unlockGarden ? `Clear ${esc(unlockGarden)}` : `Round ${tower.unlockWave}`}</span></span>${!affordable && unlocked ? '<span class="card-shortage">Need gold</span>' : ''}</button>`;
      }).join('');
    }
    const selected = game.towers.find((tower) => tower.id === state.selectedTowerId);
    const selectedId = selected?.id ?? null;
    const selectionChanged = selectedId !== this.selectedTowerId;
    const panel = document.getElementById('selection-panel');
    if (selectionChanged) {
      this.selectedTowerId = selectedId;
      panel.hidden = !selected;
      if (selected) {
        panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false');
        panel.setAttribute('aria-label', `Upgrade ${TOWERS[selected.type].name}`);
        this.dismissTip();
      } else {
        panel.removeAttribute('role'); panel.removeAttribute('aria-modal');
        panel.setAttribute('aria-label', 'Selected defender');
      }
    }
    const panelSignature = JSON.stringify([selected?.id, selected?.levels, selected?.targeting, selected?.kills, selected?.ownerId, game.points, game.profile?.pathUnlocks, comboNote(game, selected, multiplayer), multiplayer?.sessionId, multiplayer?.connected, multiplayer?.result]);
    if (panelSignature !== this.panelSignature) {
      this.panelSignature = panelSignature;
      const scrollTop = selectionChanged ? 0 : panel.scrollTop;
      const focusedPath = document.activeElement?.dataset?.upgrade;
      const targetingFocused = document.activeElement?.hasAttribute('data-targeting');
      this.renderSelection(game, selected);
      panel.scrollTop = scrollTop;
      if (!selectionChanged && focusedPath !== undefined) panel.querySelector(`[data-upgrade="${focusedPath}"]:not(:disabled)`)?.focus({ preventScroll: true });
      if (!selectionChanged && targetingFocused) panel.querySelector('[data-targeting]')?.focus({ preventScroll: true });
    }
    if (selected?.type === 'necro') {
      const counts = summonCounts(game, selected);
      for (const key of ['active', 'waiting']) {
        const value = panel.querySelector(`[data-helper-${key}]`);
        if (value) value.textContent = counts[key];
      }
    }
    if (selected) this.positionUpgrades(state.selectionAnchor);
    const resultKey = `${map?.id}-${game.status}-${multiplayer?.roomId || ''}-${multiplayer?.result?.reason || ''}`;
    if ((finished || multiplayer?.result) && this.resultShown !== resultKey) {
      this.resultShown = resultKey;
      this.showResult(game);
    }
    if (!finished && !multiplayer?.result) this.resultShown = '';
    if (multiplayer && this.modalType === 'result') {
      const endless = this.dialog.querySelector('[data-continue-endless]');
      const voted = multiplayer.endlessReady ?? me?.endlessReady;
      if (endless) { endless.disabled = !!voted || !together || !!multiplayer.paused; endless.textContent = voted ? 'WAITING FOR TEAMMATE…' : 'CONTINUE IN ENDLESS MODE ∞'; }
    }
  }

  positionUpgrades(anchor) {
    const board = document.querySelector('.board-wrap');
    const panel = document.getElementById('selection-panel');
    const margin = 10;
    const width = panel.offsetWidth;
    const x = Number.isFinite(anchor?.x) ? anchor.x : board.clientWidth / 2;
    const y = Number.isFinite(anchor?.y) ? anchor.y : board.clientHeight / 2;
    const beside = x + 22 + width <= board.clientWidth - margin ? x + 22 : x - width - 22;
    const left = Math.max(margin, Math.min(beside, board.clientWidth - width - margin));
    const rect = board.getBoundingClientRect();
    let top = margin;
    let bottom = board.clientHeight - margin;
    for (const selector of ['.resource-panel', '.round-tools', '.round-preview', '.guardian-dock', '.battle-controls']) {
      const overlay = document.querySelector(selector);
      if (overlay.hidden) continue;
      const r = overlay.getBoundingClientRect();
      if (r.right <= rect.left + left || r.left >= rect.left + left + width) continue;
      if (selector === '.guardian-dock' || selector === '.battle-controls') bottom = Math.min(bottom, r.top - rect.top - 8);
      else top = Math.max(top, r.bottom - rect.top + 8);
    }
    panel.style.maxHeight = `${Math.max(88, Math.min(560, bottom - top))}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(top, Math.min(y - 75, bottom - panel.offsetHeight))}px`;
  }

  renderSelection(game, tower) {
    const container = document.getElementById('selection-panel');
    if (!tower) { container.replaceChildren(); return; }
    const def = TOWERS[tower.type];
    const multiplayer = this.last?.state.multiplayer;
    const currency = multiplayer ? wallet : n;
    const owned = !multiplayer || tower.ownerId === multiplayer.sessionId;
    const canEdit = owned && (!multiplayer || multiplayer.connected && !multiplayer.result);
    const owner = multiplayer?.players?.find((player) => player.id === tower.ownerId);
    const stats = game.getStats(tower);
    const levels = tower.levels || def.paths.map(() => 0);
    const used = levels.filter((level) => level > 0).length;
    const limit = Math.min(2, def.paths.length);
    const targeting = tower.targeting || 'first';
    const helpers = tower.type === 'necro' ? summonCounts(game, tower) : null;
    const terrain = ['gravity', 'crystal'].includes(tower.type);
    const automatic = tower.type === 'spore' || terrain;
    const range = stats.range >= 40 ? '∞' : precise(stats.range);
    const summary = tower.type === 'strawberry'
      ? `<span><b>${n(stats.damage)}</b> blast damage</span><span><b>${n(stats.seedCount)}</b> seeds</span><span><b>${precise(stats.interval)}s</b> reload</span><span><b>∞</b> range</span>`
      : tower.type === 'gravity'
      ? `<span><b>${precise(stats.gravityDps)}</b> gravity/s</span><span><b>${precise(stats.holeDuration)}s</b> hole duration</span><span><b>${precise(stats.interval)}s</b> cooldown</span><span><b>${range}</b> range</span>`
      : tower.type === 'crystal'
        ? `<span><b>${n(stats.barrierHp)}</b> barrier HP</span><span><b>${n(stats.barrierLimit)}</b> max barriers</span><span><b>${precise(stats.interval)}s</b> cooldown</span><span><b>${range}</b> range</span>`
        : `<span><b>${precise(tower.type === 'spore' ? stats.poisonDps : stats.damage)}</b> ${tower.type === 'spore' ? 'poison/s' : tower.type === 'necro' ? 'spell damage' : 'damage'}</span><span><b>${precise(stats.attackSpeed)}</b> attacks/s</span><span><b>${range}</b> range</span>`;
    const automaticNote = tower.type === 'gravity' ? `Creates holes automatically · ${stats.capture ? 'captures enemies in the hole' : 'pulls nearby enemies inward'}` : tower.type === 'crystal' ? `Places barriers automatically · ${stats.explosionDamage > 0 ? `destroyed barriers deal ${n(stats.explosionDamage)} blast damage` : 'upgrade the blast path for on-destruction explosions'}` : stats.poisonSpreadRadius > 0 ? `Wild Garden: each mushroom infection can spread to ${n(stats.poisonSpreadTargets)} nearby ${stats.poisonSpreadTargets === 1 ? 'enemy' : 'enemies'} within ${precise(stats.poisonSpreadRadius)} range, one every ${precise(stats.poisonSpreadInterval)}s, at ${n(stats.poisonSpreadMultiplier * 100)}% damage. Spread poison cannot spread again.` : 'Mushrooms poison passing enemies · Wild Garden unlocks poison spread';
    container.innerHTML = `<div class="selected-heading">${portrait(tower.type)}<div><h3>${esc(def.name)}</h3><span>${tower.starting ? 'Free field guardian · ' : tower.starting ? 'Free starting guardian · ' : tower.purchaseCost === 0 ? 'Summoned guardian · ' : ''}${n(tower.kills)} defeated</span></div><button class="upgrade-close" data-close-upgrades aria-label="Close upgrades">×</button></div>
      ${multiplayer ? `<div class="tower-owner-note">${owned ? 'Your gnome · you choose its upgrades' : `${esc(owner?.name || 'Teammate')}’s gnome · upgrades controlled by your teammate`}</div>` : ''}
      <div class="unit-summary ${terrain ? 'terrain-summary' : ''}">${summary}</div>
      ${!automatic ? `<button class="targeting-button" data-targeting ${!canEdit ? 'disabled' : ''} title="${targetingHints[targeting] || targetingHints.first}"><span>Target: <strong>${targetingNames[targeting] || 'First'}</strong></span><span aria-hidden="true">↻</span></button>` : `<div class="targeting-note ${tower.type === 'spore' && stats.poisonSpreadRadius > 0 ? 'poison-spread-note' : ''}">${automaticNote}</div>`}
      ${tower.type === 'stun' ? `<div class="targeting-note">50% slower for ${precise(stats.slowDuration)}s · does not stack</div>` : ''}
      ${tower.type === 'strawberry' ? `<div class="targeting-note">Lobs at a fixed landing spot · ${precise(stats.flightDuration)}s flight · ${precise(stats.explosionRadius)} blast radius. Seeds deal ${n(stats.seedDamage)} damage to up to ${n(stats.seedPierce)} ${stats.seedPierce === 1 ? 'target' : 'targets'} each.</div>` : ''}
      ${helpers ? `<div class="necro-ability"><p>Spell kills queue guardians at the cottage to march toward enemies. Helper kills summon no one; helper upgrades apply to new summons.</p><div class="helper-stats" aria-label="New helper stats"><span><b>${n(stats.summonCount || 1)}</b> ${(stats.summonCount || 1) === 1 ? 'guardian' : 'guardians'} per spell kill</span><span><b>${n(stats.allyHp)}</b> helper HP</span><span><b>${n(stats.allyDamage)}</b> melee damage</span><span><b>${precise(stats.summonInterval)}s</b> dispatch</span><span><b>${precise(stats.allySpeed)}</b> march speed</span></div><div class="helper-counts"><span><b data-helper-active>${helpers.active}</b> / ${n(stats.allyLimit)} active</span><span><b data-helper-waiting>${helpers.waiting}</b> queued guardians</span></div></div>` : ''}
      ${comboNote(game, tower, multiplayer)}
      <div class="upgrade-heading"><strong>UPGRADES</strong><span>${icons.leaf}${currency(game.points)} points</span></div>
      <p class="path-rule">${limit === 1 ? '1 special path · 3 powerful tiers' : `Choose ${limit} of ${def.paths.length} paths · ${used}/${limit} chosen`}</p>
      <div class="upgrade-paths">${def.paths.map((path, index) => {
        const undiscovered = !!path.unlockSecret && !game.isPathUnlocked?.(tower.type, index);
        if (undiscovered) return `<div class="upgrade-path secret-path-locked"><div class="upgrade-copy"><strong>Mysterious path</strong><span class="secret-path-mark" aria-hidden="true">???</span><small>The cottage in Pumpkin Hollow keeps another secret.</small></div><button class="upgrade-buy" data-upgrade="${index}" disabled aria-label="Mysterious path. Visit the cottage in Pumpkin Hollow." title="Discover this path in Pumpkin Hollow">${icons.lock}<span>Undiscovered</span></button></div>`;
        const level = levels[index] || 0;
        const maxed = level >= path.costs.length;
        const locked = level === 0 && used >= limit;
        const cost = path.costs[level];
        const affordable = !maxed && !locked && game.points >= cost;
        const benefit = maxed ? path.finalTierHint || 'Maximum upgrade reached!' : upgradeBenefit(game, tower, index, stats);
        const reason = locked ? 'Only 2 paths per gnome' : maxed ? 'Fully upgraded' : !affordable ? `Need ${currency(cost - game.points)} more points` : `Upgrade ${path.name} to tier ${level + 1}`;
        return `<div class="upgrade-path ${locked ? 'path-locked' : ''} ${level ? 'invested' : ''}"><div class="upgrade-copy"><strong>${esc(path.name)}</strong><span class="tier-chips" aria-label="Tier ${level} of ${path.costs.length}">${path.costs.map((_, tier) => `<i class="${tier < level ? 'filled' : ''}">${tier + 1}</i>`).join('')}</span><small>${locked ? 'Choose a different gnome for this path.' : esc(benefit)}</small></div><button class="upgrade-buy ${maxed ? 'maxed' : ''}" data-upgrade="${index}" ${!affordable || !canEdit ? 'disabled' : ''} title="${esc(!owned ? 'Your teammate controls this gnome' : reason)}">${locked ? `${icons.lock}<span>Locked</span>` : maxed ? '<b>✓</b><span>MAX</span>' : `<b>${icons.leaf}${n(cost)}</b><span>${affordable ? 'UPGRADE' : `Need ${currency(cost - game.points)}`}</span>`}</button></div>`;
      }).join('')}</div>
      <div class="selection-footer"><span>Points come from<br>defeats & cleared rounds</span><button class="sell-button" data-sell ${!canEdit ? 'disabled' : ''}>SELL ${icons.coin}${n(Math.floor((tower.purchaseCost ?? def.cost) * .75))}</button></div>`;
  }

  openModal(type, html) {
    this.modalType = type;
    document.getElementById('dialog-content').innerHTML = html;
    if (!this.dialog.open) this.dialog.showModal();
  }
  closeModal() { this.dialog.close(); this.modalType = null; }
  showCoopLobby() {
    const multiplayer = this.last?.state.multiplayer;
    if (multiplayer) {
      this.openModal('coop-room', `<div class="modal-heading"><div><span class="eyebrow">TWO GARDENERS · ONE GARDEN</span><h2>Your co-op team</h2></div><button class="modal-close" data-close aria-label="Close co-op room">×</button></div><p class="modal-intro">Defend the same garden together. You each have your own gold, points, and gnomes. Both players press Ready for each round.</p><p class="coop-ring-legend"><span><i class="your-ring"></i>Cyan rings: your gnomes</span><span><i class="teammate-ring"></i>Amber rings: your teammate’s</span></p><div class="coop-players" id="coop-players"></div><p class="coop-room-message" id="coop-room-message" role="status"></p><div class="coop-room-actions"><button class="primary-button" data-close>BACK TO THE GARDEN ▶</button><button class="text-button" data-coop-leave>Leave co-op and play solo</button></div><p class="coop-fineprint">Leaving ends this match for both players.</p>`);
      this.syncCoopRoom(multiplayer);
      return;
    }
    if (this.modalType === 'coop-lobby') return;
    this.coopListSignature = '';
    const currentMap = this.last?.game.map?.id || this.last?.game.map || MAPS[0].id;
    this.openModal('coop-lobby', `<div class="modal-heading"><div><span class="eyebrow">TWO GARDENERS · ONE GARDEN</span><h2>Play co-op</h2></div><button class="modal-close" data-close aria-label="Close co-op lobbies">×</button></div><p class="modal-intro">Create a garden for someone to join, or hop into an open lobby. No accounts or room codes needed. Joining starts a fresh co-op run.</p><label class="coop-name-label" for="coop-name">Your nickname<input id="coop-name" type="text" maxlength="24" autocomplete="nickname" placeholder="Gardener" value="${esc(this.coopName || '')}"></label><section class="coop-create"><div><h3>Start a new garden</h3><label for="coop-map">Garden</label><select id="coop-map">${MAPS.map((map) => `<option value="${map.id}" ${map.id === currentMap ? 'selected' : ''}>${esc(map.name)}</option>`).join('')}</select></div><button class="primary-button" data-coop-create disabled>CREATE LOBBY</button></section><div class="coop-list-heading"><h3>Open lobbies</h3><button class="text-button" data-coop-refresh>Refresh</button></div><p class="coop-lobby-status" id="coop-lobby-status" role="status">Looking for open gardens…</p><div class="coop-lobbies" id="coop-lobbies"></div><p class="coop-fineprint">Each lobby has room for two players. Your host picks the garden; you share lives and split the rewards.</p>`);
    document.getElementById('coop-name').addEventListener('input', (event) => { this.coopName = event.target.value; });
    this.updateCoopLobby(this.coopLobbyState || { loading: true, available: false, lobbies: [] });
  }

  updateCoopLobby(update = {}) {
    this.coopLobbyState = { ...this.coopLobbyState, ...update };
    if (this.modalType !== 'coop-lobby') return;
    const { loading = false, error, lobbies = [], available = false } = this.coopLobbyState;
    const rooms = lobbies.filter((room) => room.mode === 'coop');
    const status = document.getElementById('coop-lobby-status');
    status.textContent = error || (loading ? 'Looking for open gardens…' : rooms.length ? `${rooms.length} open ${rooms.length === 1 ? 'garden' : 'gardens'} · pick a teammate below` : 'No open gardens yet. Create one and invite someone to open this page.');
    status.dataset.error = String(!!error);
    this.dialog.querySelector('[data-coop-create]').disabled = !available || loading;
    this.dialog.querySelector('[data-coop-refresh]').disabled = loading;
    const signature = JSON.stringify([rooms, available]);
    if (signature !== this.coopListSignature) {
      this.coopListSignature = signature;
      const focusedRoom = document.activeElement?.dataset?.coopJoin;
      const list = document.getElementById('coop-lobbies');
      list.innerHTML = rooms.map((room) => `<article class="coop-lobby-row"><div><strong>${esc(room.hostName)}’s garden</strong><span>${esc(MAPS.find((map) => map.id === room.mapId)?.name || room.mapId)} · Co-op · ${n(room.players || 1)}/2 players</span></div><button class="primary-button" data-coop-join="${esc(room.roomId)}" ${!available ? 'disabled' : ''} aria-label="Join ${esc(room.hostName)}’s garden">JOIN ▶</button></article>`).join('');
      if (focusedRoom) [...list.querySelectorAll('[data-coop-join]')].find(button => button.dataset.coopJoin === focusedRoom && !button.disabled)?.focus({ preventScroll: true });
    }
  }

  syncCoopRoom(multiplayer) {
    if (this.modalType !== 'coop-room') return;
    const players = multiplayer.players || [];
    const signature = JSON.stringify(players);
    const list = document.getElementById('coop-players');
    if (list.dataset.signature !== signature) {
      list.dataset.signature = signature;
      list.innerHTML = players.map((player) => `<div class="coop-player"><strong>${esc(player.name)}${player.id === multiplayer.sessionId ? ' (you)' : ''}</strong><span>${player.id === multiplayer.hostId ? 'Host · ' : ''}${!player.connected ? 'Reconnecting…' : player.ready ? 'Ready ✓' : 'In the garden'}</span></div>`).join('') + (players.length < 2 ? '<div class="coop-player coop-empty"><strong>Open seat</strong><span>Your lobby is visible to other gardeners.</span></div>' : '');
    }
    document.getElementById('coop-room-message').textContent = multiplayer.result ? 'This match has ended. Leave to start another garden.' : multiplayer.reconnecting || !multiplayer.connected ? 'Reconnecting to your garden…' : players.some((player) => !player.connected) ? 'The garden is paused while your teammate reconnects.' : players.length < 2 ? 'Waiting for another gardener to join…' : multiplayer.autoStart ? 'Shared auto is on. Both players ready skips the countdown; either player can turn auto off to keep building.' : 'Your team is together. Build your defenses and both press Ready!' ;
  }

  showCottageClue() {
    const game = this.last?.game;
    this.clueSignature = cottageClueSignature(game);
    const ownsMorrow = !!game?.isUnlocked('necro');
    const awakened = !!game?.isPathUnlocked?.('necro', 3);
    const kills = Math.min(NECRO_PATH_SECRET.requiredKills, game?.necroSpellKills || 0);
    const ready = !!game?.canDiscoverNecroPath?.();
    let heading = 'The cottage rhyme';
    let poem = 'The moon rises, a star wakes, a leaf falls, and a flame guides you home.';
    let hint = 'Four little lanterns remember the way.';
    let progress = '';
    if (awakened) {
      heading = 'The cottage echoes';
      poem = 'Soul Echoes awakened!';
      hint = 'Morrow can now learn Soul Echoes. Spend upgrade points to send more guardians from each spell kill. Each gnome still chooses only two paths.';
    } else if (ownsMorrow) {
      heading = ready ? 'The returning lanterns' : 'The cottage’s second verse';
      poem = ready ? 'A flame dies, a leaf falls, a star fades, and the moon remembers the way home.' : 'The cottage has another verse, but ten souls must first hear Morrow’s own spell.';
      hint = ready ? 'The lanterns remember a different journey now. Follow this new rhyme.' : 'Defeat ten skeletons with Morrow’s own spells in this Pumpkin Hollow run. Helper kills do not count.';
      progress = `<div class="cottage-soul-progress" role="status" aria-label="${n(kills)} of ${NECRO_PATH_SECRET.requiredKills} souls harvested by Morrow’s spells"><strong data-necro-soul-progress>${n(kills)} / ${NECRO_PATH_SECRET.requiredKills}</strong><span>souls harvested by Morrow’s spells</span></div>`;
    }
    this.openModal('clue', `<div class="modal-heading"><div><span class="eyebrow">PUMPKIN HOLLOW</span><h2>${heading}</h2></div><button class="modal-close" data-close aria-label="Close cottage clue">×</button></div><div class="cottage-clue ${ready || awakened ? 'cottage-awakened' : ''}"><p>${poem}</p>${progress}<small>${hint}</small></div><button class="primary-button" data-close>BACK TO THE GARDEN ▶</button>`);
  }

  showMaps() {
    if (this.last?.state.multiplayer) { this.showCoopLobby(); return; }
    const current = this.last?.game.map;
    const currentId = typeof current === 'string' ? current : current?.id;
    const bestRounds = this.last?.game.profile.bestRounds || {};
    this.openModal('maps', `<div class="modal-heading"><div><span class="eyebrow">PICK YOUR BATTLEFIELD</span><h2>Choose a garden</h2></div><button class="modal-close" data-close aria-label="Close map selection">×</button></div><p class="modal-intro">Choose winding trails, loops, spirals, or two-entrance routes. Changing gardens starts a new run; your unlocked gnomes stay with you!</p><div class="map-grid">${MAPS.map((map, index) => `<button class="map-card ${map.id === currentId ? 'current' : ''}" data-map="${map.id}"><span class="map-number">${index + 1}</span><span class="map-difficulty">${esc(map.difficulty)}</span><h3>${esc(map.name)}</h3>${mapFacts(map)}<p>${esc(map.description)}</p><span class="map-best">${bestRounds[map.id] ? `Best survived: round ${n(bestRounds[map.id])}` : 'No rounds cleared yet'}</span><span class="map-card-foot">${map.id === currentId ? 'RESTART GARDEN' : 'PLAY GARDEN'} <b>▶</b></span></button>`).join('')}</div>`);
  }
  showHelp(focusSection = null) {
    const state = this.last?.state || {};
    this.openModal('help', `<div class="modal-heading"><div><span class="eyebrow">GNOMEWARD</span><h2>Settings & field guide</h2></div><button class="modal-close" data-close aria-label="Close field guide">×</button></div><div class="settings-row"><button data-setting="pause">${state.paused ? '▶ Resume' : 'Ⅱ Pause'}</button><button data-setting="sound">Effects: ${state.sound ? 'on' : 'off'}</button><button data-setting="auto">Auto rounds: ${state.autoStart ? 'on' : 'off'}</button></div><section class="music-settings" id="music-settings" aria-labelledby="music-heading" tabindex="-1"><div class="music-heading"><h3 id="music-heading">♪ Music</h3><span>Original garden soundtracks</span></div><div class="music-choices" role="group" aria-label="Music style"><button class="music-choice" data-music="rock" aria-pressed="false"><strong>Rock</strong><span>Upbeat & energetic</span></button><button class="music-choice" data-music="chill" aria-pressed="false"><strong>Chill</strong><span>Relaxed & mellow</span></button><button class="music-choice" data-music="jazz" aria-pressed="false"><strong>Jazz</strong><span>Easygoing swing</span></button><button class="music-choice music-off" data-music="off" aria-pressed="true"><strong>Off</strong><span>No background music</span></button></div><div class="music-volume-row"><label for="music-volume">Music volume</label><input id="music-volume" type="range" min="0" max="100" step="1" value="35" aria-valuetext="35%"><output id="music-volume-value" for="music-volume">35%</output></div><p class="music-status" id="music-status" role="status" aria-live="polite">Music is off.</p><p class="music-hint">Choose a style to preview its loop. Music and game effects have separate controls.</p></section><div class="help-steps"><article><span>1</span><div><h3>Build your defense</h3><p>Pick a gnome from the shop, then click clear ground beside the path. Their ring shows attack range. Gold buys more gnomes. Some gardens have two entrances—defend both routes. Loops and spirals bring enemies past your defenses again.</p></div></article><article><span>2</span><div><h3>Start a round</h3><p>Hit the big green play button when you're ready. During a round, it cycles the speed. Auto rounds starts the next round after a short break. In co-op, both players press Ready for the first round. Shared auto then gives you five seconds between rounds; ready together to skip the wait. Either player can turn auto off to keep building. Click your Ready check to return to building; auto must be off to hold the next round. Pausing or a disconnected teammate freezes the countdown.</p></div></article><article><span>3</span><div><h3>Upgrade & aim</h3><p>Click a planted gnome to spend purple points on upgrades. Choose up to two paths per gnome. Cycle targeting between First, Last, Strong, and Close.</p></div></article><article><span>4</span><div><h3>Unlock the crew</h3><p>Beat the round 10 boss for Poppy's pink slowing gun. Clear round 15 for Tumble, and beat round 20 for Aster. Unlocks stay in this browser.</p></div></article></div><div class="help-note combo-guide"><strong>Late-game pairings</strong><p><b>Sporefire</b> · Upgrade the same Morel to <b>Potent Spores 3 + Wild Garden 3</b>, then pair it with <b>Bramble’s Big Bang 3</b>. Overlap their coverage: when Bramble hits one of Morel’s poisoned skeletons, the poison erupts in green-and-amber fire. The burst scales with enemy toughness. Each enemy needs a short cooldown before it can react again.</p><p><b>Prismstorm</b> · Upgrade Tumble to <b>Whirling Wonders 3</b>. Place it within <b>7 range</b> of a Prism with <b>both Diamond Walls 3 + Shattering Light 3</b>. Tumble periodically unleashes homing crystal volleys that ricochet between skeletons. The aura comes from Prism itself; no live barrier is needed.</p><p>These pairings reward placement and upgrades. Keep defending every entrance as endless rounds grow tougher. Co-op combos require server 0.2.5 or newer; solo combos are always available.</p></div><div class="help-note"><strong>Keep going in endless mode</strong><p>After round 20, choose Continue in endless mode to keep your gnomes, upgrades, gold, and lives. Each round brings tougher enemies until the garden falls. Your highest fully cleared round is saved for each garden in this browser. Auto rounds still works; you can pause or build between rounds.</p></div>${this.last?.game.isUnlocked('necro') ? '<div class="help-note"><strong>Morrow’s reborn crew</strong><p>Morrow can choose two upgrade paths. The cottage in Pumpkin Hollow may reveal another. His spell kills queue melee guardians at the cottage. They march toward the skeletons and fight until defeated or their time runs out. Helper upgrades improve new summons. Helper kills never summon more helpers.</p></div>' : '<div class="help-note"><strong>A quieter rumor</strong><p>Pumpkin Hollow keeps a quiet secret. Its cottage may have a story to tell.</p></div>'}<div class="help-note secret-rumors"><strong>Garden rumors</strong><p>Three discoveries in Mossy Meadow and three in Crystal Quarry may reveal hidden guardians. Look closely at the scenery! One guardian’s final power upgrade makes its holes capture enemies. Another grows barriers that can explode when enemies destroy them.</p></div><div class="help-note"><strong>Know your skeletons</strong><div class="enemy-guide">${Object.values(ENEMIES).filter((enemy) => !enemy.boss).map((enemy) => `<span><i style="background:${enemy.color}"></i>${esc(enemy.name.replace(' skeleton', ''))}: ${enemy.hp} base HP</span>`).join('')}</div><p>Health grows after round 5. Morel’s Wild Garden upgrade spreads poison to nearby skeletons at 65% damage. Spread poison cannot spread again. Poison and explosions help with groups. Press Esc to cancel placement or close upgrades.</p></div><button class="primary-button" data-close>BACK TO THE GARDEN ▶</button>`);
    this.syncAudioSettings(state);
    if (focusSection === 'music') {
      const section = document.getElementById('music-settings');
      section.scrollIntoView({ block: 'start', behavior: 'instant' });
      section.focus({ preventScroll: true });
    }
  }

  syncAudioSettings(state) {
    if (this.modalType !== 'help') return;
    const genre = ['rock', 'chill', 'jazz'].includes(state.music) ? state.music : 'off';
    const names = { rock: 'Rock', chill: 'Chill', jazz: 'Jazz', off: 'Off' };
    const percent = Math.round(Math.max(0, Math.min(1, Number.isFinite(state.musicVolume) ? state.musicVolume : .35)) * 100);
    for (const button of document.querySelectorAll('[data-music]')) {
      button.setAttribute('aria-pressed', String(button.dataset.music === genre));
    }
    const volume = document.getElementById('music-volume');
    if (volume) {
      // Keep the live range input intact while its thumb is being dragged.
      if (document.activeElement !== volume) volume.value = String(percent);
      const displayedVolume = Number(volume.value);
      volume.setAttribute('aria-valuetext', `${displayedVolume}%`);
      document.getElementById('music-volume-value').value = `${displayedVolume}%`;
    }
    const status = document.getElementById('music-status');
    if (status) {
      const descriptions = {
        loading: `Loading ${names[genre]}…`,
        playing: `${names[genre]} is playing${percent === 0 ? ' · volume muted' : ''}.`,
        ready: `${names[genre]} selected · ready to play.`,
        error: `Couldn't play ${names[genre]}. Choose it again to retry.`,
      };
      const message = genre === 'off' ? 'Music is off.' : descriptions[state.musicStatus] || descriptions.ready;
      if (status.textContent !== message) status.textContent = message;
      status.dataset.status = genre === 'off' ? 'off' : state.musicStatus || 'ready';
    }
    for (const button of document.querySelectorAll('[data-setting]')) {
      const setting = button.dataset.setting;
      const labels = { pause: state.paused ? '▶ Resume' : 'Ⅱ Pause', sound: `Effects: ${state.sound ? 'on' : 'off'}`, auto: `Auto rounds: ${state.autoStart ? 'on' : 'off'}` };
      button.textContent = labels[setting];
      button.disabled = !!state.multiplayer && (setting === 'auto' ? !state.multiplayer.autoSupported || !state.multiplayer.connected || state.multiplayer.reconnecting || !!state.multiplayer.result : setting === 'pause' && (!state.multiplayer.connected || !!state.multiplayer.result || state.multiplayer.players?.length !== 2 || state.multiplayer.players?.some((player) => !player.connected)));
      if (state.multiplayer && setting === 'auto') {
        button.textContent = state.multiplayer.autoSupported ? `Shared auto: ${state.autoStart ? 'on' : 'off'}` : 'Auto: update server to 0.2.4';
        button.title = state.multiplayer.autoSupported ? 'Either player can turn this off to hold the next round.' : 'Update the server to 0.2.4 for shared auto rounds and changeable readiness.';
      } else button.title = '';
      if (setting !== 'pause') button.setAttribute('aria-pressed', String(!!(setting === 'sound' ? state.sound : state.autoStart)));
    }
  }

  showResult(game) {
    const won = game.status === 'won';
    const survived = game.completedWaves ?? (won ? game.wave : Math.max(0, game.wave - 1));
    const multiplayer = this.last?.state.multiplayer;
    if (multiplayer) {
      const ended = !!multiplayer.result;
      const cleared = won && !ended;
      const me = multiplayer.players?.find((player) => player.id === multiplayer.sessionId);
      const voted = multiplayer.endlessReady ?? me?.endlessReady;
      const together = multiplayer.connected && multiplayer.players?.length === 2 && multiplayer.players.every((player) => player.connected);
      const reason = multiplayer.result?.reason;
      const interrupted = ended && !['defeat', 'campaign-cleared'].includes(reason);
      const message = cleared ? 'You saved the garden together! Both players can choose endless mode to keep this defense growing.' : interrupted ? reason === 'server-closed' ? 'The server closed this match. You can join a new lobby when it is back online.' : reason === 'idle-timeout' ? 'This garden closed after being idle. Start a new lobby whenever you are ready.' : 'Your co-op match has ended because a player left or could not reconnect.' : `Together, you survived through round ${n(survived)}. Start a new garden and try another strategy!`;
      this.openModal('result', `<div class="result-card"><span class="eyebrow">${cleared ? 'GARDEN SAVED TOGETHER!' : 'CO-OP MATCH COMPLETE'}</span><h2>${cleared ? 'TEAM VICTORY!' : interrupted ? 'Garden closed' : 'What a team!'}</h2><p>${message}</p><div class="result-stats"><span><strong>${n(survived)}</strong><small>ROUNDS SURVIVED</small></span><span><strong>${game.towers.length}</strong><small>TEAM GNOMES</small></span><span><strong>${n(game.lives)}</strong><small>SHARED LIVES</small></span></div>${cleared ? `<button class="primary-button" data-continue-endless ${voted || !together || multiplayer.paused ? 'disabled' : ''}>${voted ? 'WAITING FOR TEAMMATE…' : 'CONTINUE IN ENDLESS MODE ∞'}</button>` : ''}<button class="${cleared ? 'text-button' : 'primary-button'}" data-coop-leave>LEAVE CO-OP</button><button class="text-button" data-close>View the battlefield</button></div>`);
      return;
    }
    this.openModal('result', `<div class="result-card"><span class="eyebrow">${won ? 'GARDEN SAVED!' : game.endless ? 'ENDLESS RUN COMPLETE' : 'THE SKELETONS GOT THROUGH'}</span><h2>${won ? 'VICTORY!' : game.endless ? 'What a stand!' : 'Try a new strategy!'}</h2><p>${won ? 'Your guardians saved the garden! Keep your whole defense and continue against ever stronger skeletons. How far can you go?' : `You survived through round ${n(survived)}. The garden fell during round ${n(game.wave)}.`}</p><div class="result-stats"><span><strong>${n(survived)}</strong><small>ROUNDS SURVIVED</small></span><span><strong>${game.towers.length}</strong><small>GNOMES</small></span><span><strong>${n(game.lives)}</strong><small>LIVES</small></span></div><p class="result-best">Garden best: <strong>round ${n(game.bestRound)}</strong><small>Saved in this browser · fully cleared rounds</small></p>${won ? '<button class="primary-button" data-continue-endless>CONTINUE IN ENDLESS MODE ∞</button><button class="text-button" data-restart>Start a new run</button>' : '<button class="primary-button" data-restart>PLAY AGAIN ▶</button>'}<button class="text-button" data-maps>Choose another garden</button><button class="text-button" data-close>View the battlefield</button></div>`);
  }
  announce(message, kind = 'round') {
    const banner = document.getElementById('round-announcement');
    clearTimeout(this.announcementTimer);
    banner.textContent = message;
    banner.dataset.kind = kind;
    banner.hidden = false;
    this.announcementTimer = setTimeout(() => { banner.hidden = true; }, 2400);
  }
  toast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast'; toast.textContent = message;
    const stack = document.getElementById('toast-stack');
    stack.append(toast);
    while (stack.children.length > 3) stack.firstElementChild.remove();
    setTimeout(() => { toast.classList.add('leaving'); setTimeout(() => toast.remove(), 200); }, 3500);
  }
}
