import { MAPS, TOWERS, ENEMIES } from './data.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (value) => Math.round(Number(value) || 0).toLocaleString();
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

function upgradeBenefit(game, tower, index, stats) {
  const levels = [...tower.levels];
  levels[index]++;
  const next = game.getStats({ ...tower, levels });
  const labels = [
    ['damage', 'Damage'], ['shots', 'Targets'], ['attackSpeed', 'Attacks/s'],
    ['poisonDps', 'Poison/s'], ['poisonDuration', 'Poison seconds'], ['slowDuration', 'Slow seconds'],
    ['explosionDamage', 'Blast damage'], ['explosionRadius', 'Blast radius'], ['range', 'Range'],
    ['charges', 'Mushroom hits'], ['trapRadius', 'Spore radius'],
  ];
  return labels.filter(([key]) => Number.isFinite(next[key]) && next[key] > (stats[key] || 0) + .001)
    .map(([key, label]) => `${label} ${precise(stats[key] || 0)} → ${precise(next[key])}`).join(' · ')
    || TOWERS[tower.type].paths[index].description;
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
            <div class="field-toolbar"><span class="brand">GNOMEWARD</span><button class="map-picker" id="map-button" title="Choose a map"><span id="map-name">Mossy Meadow</span> <span aria-hidden="true">▾</span></button></div>
          </div>
          <div class="round-tools"><div class="wave-count"><small>ROUND</small><strong id="hud-wave">1<span>/20</span></strong></div><button class="icon-button" id="help-button" aria-label="Settings and how to play" title="Settings and how to play">☰</button></div>
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
              <div class="battle-status"><span class="status-dot" id="status-dot"></span><strong id="status-title">Ready to defend!</strong><small id="status-detail">Place a gnome to get started.</small></div>
              <button class="start-button" id="start-button"><span class="play-triangle" aria-hidden="true">▶</span><span id="start-label">START ROUND 1</span></button>
              <div class="play-controls"><button class="control-button" id="pause-button" aria-label="Pause game" title="Pause / resume">Ⅱ</button><button class="control-button" id="speed-button" aria-label="Change game speed" title="Change game speed">1×</button><button class="control-button" id="sound-button" aria-label="Audio settings" title="Audio settings" aria-haspopup="dialog">♪</button></div>
              <button class="auto-button" id="auto-button" aria-pressed="false"><span class="toggle-check" aria-hidden="true"></span><span id="auto-label">Auto rounds: off</span></button>
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
    click('start-button', () => actions.onStartWave?.());
    click('pause-button', () => actions.onPause?.());
    click('speed-button', () => actions.onSpeed?.());
    click('sound-button', () => this.showHelp('music'));
    click('auto-button', () => actions.onAuto?.());
    click('cancel-placement', () => actions.onCancel?.());
    click('dismiss-tip', () => this.dismissTip());
    click('map-button', () => this.showMaps());
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
      if (event.target.closest('[data-sell]')) actions.onSell?.();
      if (event.target.closest('[data-targeting]')) actions.onTargeting?.();
      if (event.target.closest('[data-close-upgrades]')) actions.onCancel?.();
    });
    this.dialog = document.getElementById('game-dialog');
    this.dialog.addEventListener('click', (event) => { if (event.target === this.dialog) this.closeModal(); });
    this.dialog.addEventListener('close', () => { this.modalType = null; });
    document.getElementById('dialog-content').addEventListener('click', (event) => {
      if (event.target.closest('[data-close]')) this.closeModal();
      const map = event.target.closest('[data-map]');
      if (map) { this.closeModal(); this.resultShown = ''; actions.onMap?.(map.dataset.map); }
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
  }

  update(game, state = {}) {
    this.last = { game, state };
    const set = (id, text) => { document.getElementById(id).textContent = text; };
    const map = typeof game.map === 'string' ? MAPS.find((m) => m.id === game.map) : game.map;
    const inWave = game.status === 'wave';
    const finished = ['won', 'lost'].includes(game.status);
    const upcoming = Math.min(game.maxWaves || 20, Number(game.wave || 0) + 1);
    const displayedRound = inWave || finished ? game.wave : upcoming;
    set('hud-lives', n(game.lives)); set('hud-gold', n(game.gold)); set('hud-points', n(game.points));
    document.getElementById('hud-wave').innerHTML = `${displayedRound}<span>/${game.maxWaves || 20}</span>`;
    set('map-name', map?.name || MAPS[0].name);
    const start = document.getElementById('start-button');
    start.disabled = finished;
    start.classList.toggle('fast-forward', inWave);
    start.innerHTML = `<span class="play-triangle" aria-hidden="true">${inWave && !state.paused ? '▶▶' : '▶'}</span><span>${finished ? 'FINISHED' : inWave && state.paused ? 'RESUME' : inWave ? `SPEED ${state.speed || 1}×` : `START ROUND ${upcoming}`}</span>`;
    start.setAttribute('aria-label', finished ? 'Game finished' : inWave && state.paused ? 'Resume round' : inWave ? `Change speed, currently ${state.speed || 1}×` : `Start round ${upcoming}`);
    start.title = inWave && state.paused ? 'Resume the round' : inWave ? 'Click to cycle game speed' : 'Send the next round';
    const countdown = state.autoStart && state.autoCountdown != null && !inWave && !finished;
    set('status-title', finished ? game.status === 'won' ? 'VICTORY!' : 'Garden overrun' : state.paused ? 'PAUSED' : countdown ? `Next round in ${Math.ceil(state.autoCountdown)}s` : inWave ? 'Defend the garden!' : 'Ready for the next round?');
    set('status-detail', inWave ? `${game.enemies?.length || 0} skeletons on the path` : 'Build and upgrade before starting.');
    document.getElementById('status-dot').classList.toggle('active', inWave && !state.paused);
    set('speed-button', `${state.speed || 1}×`);
    set('pause-button', state.paused ? '▶' : 'Ⅱ');
    document.getElementById('pause-button').setAttribute('aria-label', state.paused ? 'Resume game' : 'Pause game');
    document.getElementById('pause-button').setAttribute('aria-pressed', String(!!state.paused));
    document.getElementById('sound-button').dataset.musicActive = String(state.music && state.music !== 'off');
    this.syncAudioSettings(state);
    document.getElementById('auto-button').setAttribute('aria-pressed', String(!!state.autoStart));
    set('auto-label', countdown && !state.paused ? `Next round in ${Math.ceil(state.autoCountdown)}s` : `Auto rounds: ${state.autoStart ? 'on' : 'off'}`);
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
        return `<button class="tower-card ${!unlocked ? 'locked' : !affordable ? 'unaffordable' : 'affordable'} ${state.placingType === id ? 'chosen' : ''}" data-tower="${id}" ${!unlocked || !affordable ? 'disabled' : ''} aria-pressed="${state.placingType === id}" title="${esc(tower.description)}${!unlocked ? ` Beat round ${tower.unlockWave} to unlock.` : !affordable ? ' Not enough gold.' : ''}"><div class="tower-art" style="--tower-color:${tower.color}">${portrait(id)}${!unlocked ? `<span class="lock-badge">${icons.lock}</span>` : ''}</div><span class="tower-info"><strong>${esc(tower.name)}</strong><span class="tower-cost">${unlocked ? `${icons.coin}${n(tower.cost)}` : `Round ${tower.unlockWave}`}</span></span>${!affordable && unlocked ? '<span class="card-shortage">Need gold</span>' : ''}</button>`;
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
    const panelSignature = JSON.stringify([selected?.id, selected?.levels, selected?.targeting, selected?.kills, game.points]);
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
    if (selected) this.positionUpgrades(state.selectionAnchor);
    if (finished && this.resultShown !== `${map?.id}-${game.status}`) {
      this.resultShown = `${map?.id}-${game.status}`;
      this.showResult(game);
    }
    if (!finished) this.resultShown = '';
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
    const stats = game.getStats(tower);
    const levels = tower.levels || def.paths.map(() => 0);
    const used = levels.filter((level) => level > 0).length;
    const limit = Math.min(2, def.paths.length);
    const targeting = tower.targeting || 'first';
    container.innerHTML = `<div class="selected-heading">${portrait(tower.type)}<div><h3>${esc(def.name)}</h3><span>${n(tower.kills)} defeated</span></div><button class="upgrade-close" data-close-upgrades aria-label="Close upgrades">×</button></div>
      <div class="unit-summary"><span><b>${precise(tower.type === 'spore' ? stats.poisonDps : stats.damage)}</b> ${tower.type === 'spore' ? 'poison/s' : 'damage'}</span><span><b>${precise(stats.attackSpeed)}</b> attacks/s</span><span><b>${stats.range >= 40 ? '∞' : precise(stats.range)}</b> range</span></div>
      ${tower.type !== 'spore' ? `<button class="targeting-button" data-targeting title="${targetingHints[targeting] || targetingHints.first}"><span>Target: <strong>${targetingNames[targeting] || 'First'}</strong></span><span aria-hidden="true">↻</span></button>` : '<div class="targeting-note">Mushrooms poison passing enemies</div>'}
      ${tower.type === 'stun' ? `<div class="targeting-note">50% slower for ${precise(stats.slowDuration)}s · does not stack</div>` : ''}
      <div class="upgrade-heading"><strong>UPGRADES</strong><span>${icons.leaf}${n(game.points)} points</span></div>
      <p class="path-rule">${limit === 1 ? '1 special path · 3 powerful tiers' : `Choose ${limit} paths · ${used}/${limit} chosen`}</p>
      <div class="upgrade-paths">${def.paths.map((path, index) => {
        const level = levels[index] || 0;
        const maxed = level >= path.costs.length;
        const locked = level === 0 && used >= limit;
        const cost = path.costs[level];
        const affordable = !maxed && !locked && game.points >= cost;
        const benefit = maxed ? 'Maximum upgrade reached!' : upgradeBenefit(game, tower, index, stats);
        const reason = locked ? 'Only 2 paths per gnome' : maxed ? 'Fully upgraded' : !affordable ? `Need ${n(cost - game.points)} more points` : `Upgrade ${path.name} to tier ${level + 1}`;
        return `<div class="upgrade-path ${locked ? 'path-locked' : ''} ${level ? 'invested' : ''}"><div class="upgrade-copy"><strong>${esc(path.name)}</strong><span class="tier-chips" aria-label="Tier ${level} of ${path.costs.length}">${path.costs.map((_, tier) => `<i class="${tier < level ? 'filled' : ''}">${tier + 1}</i>`).join('')}</span><small>${locked ? 'Choose a different gnome for this path.' : esc(benefit)}</small></div><button class="upgrade-buy ${maxed ? 'maxed' : ''}" data-upgrade="${index}" ${!affordable ? 'disabled' : ''} title="${esc(reason)}">${locked ? `${icons.lock}<span>Locked</span>` : maxed ? '<b>✓</b><span>MAX</span>' : `<b>${icons.leaf}${n(cost)}</b><span>${affordable ? 'UPGRADE' : `Need ${n(cost - game.points)}`}</span>`}</button></div>`;
      }).join('')}</div>
      <div class="selection-footer"><span>Points come from<br>defeats & cleared rounds</span><button class="sell-button" data-sell>SELL ${icons.coin}${n(Math.floor(def.cost * .75))}</button></div>`;
  }

  openModal(type, html) {
    this.modalType = type;
    document.getElementById('dialog-content').innerHTML = html;
    if (!this.dialog.open) this.dialog.showModal();
  }
  closeModal() { this.dialog.close(); this.modalType = null; }
  showMaps() {
    const current = this.last?.game.map;
    const currentId = typeof current === 'string' ? current : current?.id;
    this.openModal('maps', `<div class="modal-heading"><div><span class="eyebrow">PICK YOUR BATTLEFIELD</span><h2>Choose a garden</h2></div><button class="modal-close" data-close aria-label="Close map selection">×</button></div><p class="modal-intro">Changing gardens starts a new run. Your unlocked gnomes stay with you!</p><div class="map-grid">${MAPS.map((map, index) => `<button class="map-card ${map.id === currentId ? 'current' : ''}" data-map="${map.id}"><span class="map-number">${index + 1}</span><span class="map-difficulty">${esc(map.difficulty)}</span><h3>${esc(map.name)}</h3><p>${esc(map.description)}</p><span class="map-card-foot">${map.id === currentId ? 'RESTART GARDEN' : 'PLAY GARDEN'} <b>▶</b></span></button>`).join('')}</div>`);
  }
  showHelp(focusSection = null) {
    const state = this.last?.state || {};
    this.openModal('help', `<div class="modal-heading"><div><span class="eyebrow">GNOMEWARD</span><h2>Settings & field guide</h2></div><button class="modal-close" data-close aria-label="Close field guide">×</button></div><div class="settings-row"><button data-setting="pause">${state.paused ? '▶ Resume' : 'Ⅱ Pause'}</button><button data-setting="sound">Effects: ${state.sound ? 'on' : 'off'}</button><button data-setting="auto">Auto rounds: ${state.autoStart ? 'on' : 'off'}</button></div><section class="music-settings" id="music-settings" aria-labelledby="music-heading" tabindex="-1"><div class="music-heading"><h3 id="music-heading">♪ Music</h3><span>Original garden soundtracks</span></div><div class="music-choices" role="group" aria-label="Music style"><button class="music-choice" data-music="rock" aria-pressed="false"><strong>Rock</strong><span>Upbeat & energetic</span></button><button class="music-choice" data-music="chill" aria-pressed="false"><strong>Chill</strong><span>Relaxed & mellow</span></button><button class="music-choice" data-music="jazz" aria-pressed="false"><strong>Jazz</strong><span>Easygoing swing</span></button><button class="music-choice music-off" data-music="off" aria-pressed="true"><strong>Off</strong><span>No background music</span></button></div><div class="music-volume-row"><label for="music-volume">Music volume</label><input id="music-volume" type="range" min="0" max="100" step="1" value="35" aria-valuetext="35%"><output id="music-volume-value" for="music-volume">35%</output></div><p class="music-status" id="music-status" role="status" aria-live="polite">Music is off.</p><p class="music-hint">Choose a style to preview its loop. Music and game effects have separate controls.</p></section><div class="help-steps"><article><span>1</span><div><h3>Build your defense</h3><p>Pick a gnome from the shop, then click clear ground beside the path. Their ring shows attack range. Gold buys more gnomes.</p></div></article><article><span>2</span><div><h3>Start a round</h3><p>Hit the big green play button when you're ready. During a round, it cycles the speed. Auto rounds starts the next round after a short break.</p></div></article><article><span>3</span><div><h3>Upgrade & aim</h3><p>Click a planted gnome to spend purple points on upgrades. Choose up to two paths per gnome. Cycle targeting between First, Last, Strong, and Close.</p></div></article><article><span>4</span><div><h3>Unlock the crew</h3><p>Beat the round 10 boss for Poppy's pink slowing gun. Clear round 15 for Tumble, and beat round 20 for Aster. Unlocks stay in this browser.</p></div></article></div><div class="help-note"><strong>Know your skeletons</strong><div class="enemy-guide">${Object.values(ENEMIES).filter((enemy) => !enemy.boss).map((enemy) => `<span><i style="background:${enemy.color}"></i>${esc(enemy.name.replace(' skeleton', ''))}: ${enemy.hp} base HP</span>`).join('')}</div><p>Health grows after round 5. Poison and explosions help with groups. Press Esc to cancel placement or close upgrades.</p></div><button class="primary-button" data-close>BACK TO THE GARDEN ▶</button>`);
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
      if (setting !== 'pause') button.setAttribute('aria-pressed', String(!!(setting === 'sound' ? state.sound : state.autoStart)));
    }
  }

  showResult(game) {
    const won = game.status === 'won';
    this.openModal('result', `<div class="result-card"><span class="eyebrow">${won ? 'GARDEN SAVED!' : 'THE SKELETONS GOT THROUGH'}</span><h2>${won ? 'VICTORY!' : 'Try a new strategy!'}</h2><p>${won ? 'Your little guardians won a very big battle. Take the whole crew to another garden!' : 'Try mushrooms near a bend, overlapping attack ranges, and a few early upgrades.'}</p><div class="result-stats"><span><strong>${game.wave}</strong><small>ROUNDS</small></span><span><strong>${game.towers.length}</strong><small>GNOMES</small></span><span><strong>${n(game.lives)}</strong><small>LIVES</small></span></div><button class="primary-button" data-restart>PLAY AGAIN ▶</button><button class="text-button" data-maps>Choose another garden</button><button class="text-button" data-close>View the battlefield</button></div>`);
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
