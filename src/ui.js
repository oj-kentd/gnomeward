import { MAPS, TOWERS } from './data.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = (value) => Math.round(Number(value) || 0).toLocaleString();
const portrait = (type, cls = '') => `<img class="portrait ${cls}" src="${import.meta.env.BASE_URL}assets/${type}.png" alt="" draggable="false">`;
const icons = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3.4 12.4C-2 6.9 5.7.1 12 6.3 18.3.1 26 6.9 20.6 12.4Z"/></svg>',
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v12m3-10h-5a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3C8 1 2 7 4 15s15 8 17-12Z"/><path d="M3 22 16 9" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

export class UI {
  constructor(actions) {
    this.actions = actions;
    this.last = null;
    this.panelSignature = '';
    this.rosterSignature = '';
    this.resultShown = '';
    this.modalType = null;
    document.querySelector('#app').innerHTML = `
      <div class="game-shell">
        <header class="topbar">
          <a class="brand" href="./" aria-label="Gnomeward home"><span class="brand-mark">g.</span><span><strong>GNOMEWARD</strong><small>A LITTLE GARDEN. A BIG ADVENTURE.</small></span></a>
          <div class="hud" aria-label="Game resources">
            <div class="hud-stat hearts">${icons.heart}<span><strong id="hud-lives">100</strong><small>LIVES</small></span></div>
            <div class="hud-stat coins">${icons.coin}<span><strong id="hud-gold">650</strong><small>GOLD</small></span></div>
            <div class="hud-stat points">${icons.leaf}<span><strong id="hud-points">0</strong><small>UPGRADE POINTS</small></span></div>
          </div>
          <div class="header-actions"><span class="playtest-badge">PLAYTEST 01</span><button class="icon-button" id="help-button" aria-label="How to play" title="How to play">?</button></div>
        </header>
        <main class="game-main">
          <section class="field" aria-label="Garden battlefield">
            <div class="field-toolbar"><button class="map-picker" id="map-button"><span class="tiny-label">YOUR GARDEN</span><span><strong id="map-name">Clover Bend</strong><span class="chevron">⌄</span></span></button><span class="field-note" id="field-note">A cozy place to make a stand.</span><div class="wave-count"><small>WAVE</small><strong id="hud-wave">0<span> / 20</span></strong></div></div>
            <div class="board-wrap"><div id="scene" aria-label="3D garden. Choose a gnome, then select an open patch to place it." role="application" tabindex="0"></div>
              <div class="loading-card" id="loading-card"><span class="loading-dot"></span><strong>Growing your garden…</strong><small id="loading-message">Unpacking the gnomes</small></div>
              <div class="welcome-tip" id="welcome-tip"><button id="dismiss-tip" aria-label="Dismiss welcome tip">×</button><span class="eyebrow">SMALL GNOMES. MIGHTY DEFENDERS.</span><h1>The garden needs you.</h1><p>Pick a gnome, plant them beside the path, and send in the skeletons.</p><span class="tip-foot">Every good defense starts with a little Sprout.</span></div>
              <div class="placement-banner" id="placement-banner" hidden><span id="placement-text"></span><button id="cancel-placement">Cancel <kbd>Esc</kbd></button></div>
              <div class="board-corner">KEEP THE GARDEN GROWING</div>
            </div>
            <footer class="battle-controls"><div class="battle-status"><span class="status-dot" id="status-dot"></span><span><strong id="status-title">Make yourself at gnome.</strong><small id="status-detail">Place your defenders, then start the first wave.</small></span></div><div class="play-controls"><button class="control-button" id="sound-button" aria-label="Toggle sound" title="Toggle sound">Sound off</button><button class="control-button speed-button" id="speed-button" aria-label="Change game speed">1×</button><button class="control-button pause-button" id="pause-button" aria-label="Pause game" title="Pause game">Ⅱ</button><button class="start-button" id="start-button"><span>START WAVE</span><span class="play-triangle">▶</span></button></div></footer>
          </section>
          <aside class="sidebar" aria-label="Gnome defenders and upgrades">
            <div class="sidebar-heading"><div><span class="eyebrow">YOUR TRUSTY CREW</span><h2>Garden guardians</h2></div><span class="roster-count">6</span></div>
            <div class="roster" id="roster"></div>
            <section class="selection-panel" id="selection-panel" aria-label="Selected defender"></section>
            <div class="sidebar-bottom"><span class="small-leaf">✦</span><p>A little strategy.<br>A whole lot of gnome.</p><button id="sidebar-help">Field guide ↗</button></div>
          </aside>
        </main>
        <div class="toast-stack" id="toast-stack" aria-live="polite"></div>
        <dialog id="game-dialog" class="game-dialog"><div id="dialog-content"></div></dialog>
      </div>`;
    const byId = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    byId('start-button', () => actions.onStartWave?.());
    byId('pause-button', () => actions.onPause?.());
    byId('speed-button', () => actions.onSpeed?.());
    byId('sound-button', () => actions.onSound?.());
    byId('cancel-placement', () => actions.onCancel?.());
    byId('dismiss-tip', () => this.dismissTip());
    byId('map-button', () => this.showMaps());
    byId('help-button', () => this.showHelp());
    byId('sidebar-help', () => this.showHelp());
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
    });
  }

  dismissTip() { document.getElementById('welcome-tip').hidden = true; }
  setLoading(value) {
    const loading = document.getElementById('loading-card');
    if (value == null || value === false || value === 1 || value === 100 || value === 'ready') { loading.hidden = true; return; }
    loading.hidden = false;
    document.getElementById('loading-message').textContent = typeof value === 'string' ? value : 'Bringing the garden to life';
  }
  update(game, state = {}) {
    this.last = { game, state };
    const set = (id, text) => { document.getElementById(id).textContent = text; };
    const map = typeof game.map === 'string' ? MAPS.find((m) => m.id === game.map) : game.map;
    set('hud-lives', n(game.lives)); set('hud-gold', n(game.gold)); set('hud-points', n(game.points));
    document.getElementById('hud-wave').innerHTML = `${game.wave || 0}<span> / ${game.maxWaves || 20}</span>`;
    set('map-name', map?.name || MAPS[0].name); set('field-note', map?.subtitle || 'A cozy place to make a stand.');
    const inWave = game.status === 'wave';
    const finished = ['won', 'lost'].includes(game.status);
    const start = document.getElementById('start-button');
    start.disabled = inWave || finished;
    start.innerHTML = `<span>${finished ? 'GARDEN RESTING' : inWave ? 'WAVE IN PROGRESS' : `START WAVE ${Number(game.wave || 0) + 1}`}</span><span class="play-triangle">${inWave ? '•••' : '▶'}</span>`;
    const next = typeof game.nextWaveInfo === 'function' ? game.nextWaveInfo() : null;
    const bossNext = ((game.wave || 0) + 1) % 10 === 0;
    set('status-title', finished ? game.status === 'won' ? 'Your garden is safe!' : 'The skeletons got through.' : state.paused ? 'Taking a garden break.' : inWave ? (game.wave === 20 ? 'The Skeleton King has arrived!' : game.wave === 10 ? 'The Bone Baron has arrived!' : 'Hold the garden gate!') : bossNext ? 'A boss is on the horizon.' : 'Ready when you are.');
    set('status-detail', finished ? 'Try another garden or perfect your strategy.' : inWave ? `${game.enemies?.length || 0} skeletons on the path${state.paused ? ' · Paused' : ''}` : state.placingType ? 'Click an open patch beside the path to place your gnome.' : next?.description || 'Build, upgrade, then send in the next wave.');
    document.getElementById('status-dot').classList.toggle('active', inWave && !state.paused);
    set('speed-button', `${state.speed || 1}×`); set('pause-button', state.paused ? '▶' : 'Ⅱ');
    document.getElementById('pause-button').setAttribute('aria-label', state.paused ? 'Resume game' : 'Pause game');
    document.getElementById('pause-button').classList.toggle('is-active', !!state.paused);
    set('sound-button', state.sound ? 'Sound on' : 'Sound off');
    document.getElementById('sound-button').setAttribute('aria-pressed', String(!!state.sound));
    const placement = document.getElementById('placement-banner');
    placement.hidden = !state.placingType;
    if (state.placingType) set('placement-text', `Plant ${TOWERS[state.placingType]?.name || 'your gnome'} · ${n(TOWERS[state.placingType]?.cost)} gold`);
    const rosterSignature = JSON.stringify([state.placingType, Object.keys(TOWERS).map((id) => [game.isUnlocked(id), game.gold >= TOWERS[id].cost])]);
    if (rosterSignature !== this.rosterSignature) {
      this.rosterSignature = rosterSignature;
      document.getElementById('roster').innerHTML = Object.entries(TOWERS).map(([id, tower]) => {
        const unlocked = game.isUnlocked(id);
        const affordable = game.gold >= tower.cost;
        return `<button class="tower-card ${unlocked ? '' : 'locked'} ${state.placingType === id ? 'chosen' : ''}" data-tower="${id}" ${!unlocked || !affordable ? 'disabled' : ''} aria-pressed="${state.placingType === id}" title="${esc(tower.description)}${!unlocked ? ` Unlock: beat wave ${tower.unlockWave}.` : ''}"><div class="tower-art" style="--tower-color:${tower.color || '#bbc781'}">${portrait(id)}${!unlocked ? '<span class="lock-badge">LOCKED</span>' : ''}</div><span class="tower-info"><strong>${esc(tower.name)}</strong><small>${esc(tower.role || '')}</small><span class="tower-cost ${!affordable && unlocked ? 'too-expensive' : ''}">${unlocked ? `${icons.coin}${n(tower.cost)}` : `Beat wave ${tower.unlockWave}`}</span></span></button>`;
      }).join('');
    }
    const selected = game.towers.find((tower) => tower.id === state.selectedTowerId);
    const panelSignature = JSON.stringify([selected?.id, selected?.levels, selected?.kills, Math.floor(selected?.damageDone || 0), game.points, state.placingType]);
    if (panelSignature !== this.panelSignature) {
      this.panelSignature = panelSignature;
      this.renderSelection(game, selected, state.placingType);
    }
    if (finished && this.resultShown !== `${map?.id}-${game.status}`) {
      this.resultShown = `${map?.id}-${game.status}`;
      this.showResult(game);
    }
    if (!finished) this.resultShown = '';
  }

  renderSelection(game, tower, placingType) {
    const container = document.getElementById('selection-panel');
    if (!tower) {
      const def = TOWERS[placingType];
      container.innerHTML = def ? `<div class="planting-info"><span class="eyebrow">READY TO PLANT</span><h3>${esc(def.name)}</h3><p>${esc(def.description)}</p><div class="instruction-note">Choose a clear patch of grass beside the path. A green ring means you're good to grow.</div></div>` : `<div class="empty-selection"><span class="selection-spark">✦</span><h3>Room to grow.</h3><p>Select a guardian above to plant it.<br>Select one in your garden to upgrade.</p><div class="path-rule"><strong>Choose your own specialty</strong><span>Spend points on up to 2 upgrade paths per gnome.</span></div></div>`;
      return;
    }
    const def = TOWERS[tower.type];
    const stats = game.getStats(tower);
    const levels = tower.levels || def.paths.map(() => 0);
    const pathsUsed = levels.filter((level) => level > 0).length;
    const pathLimit = Math.min(2, def.paths.length);
    container.innerHTML = `<div class="selected-heading">${portrait(tower.type)}<div><span class="eyebrow">IN YOUR GARDEN</span><h3>${esc(def.name)}</h3><small>${n(tower.kills)} vanquished · ${n(tower.damageDone)} damage</small></div></div><div class="tower-stats"><span><small>${tower.type === 'spore' ? 'POISON / SEC' : 'DAMAGE'}</small><strong>${n(tower.type === 'spore' ? stats.poisonDps : stats.damage)}</strong></span><span><small>RANGE</small><strong>${stats.range >= 40 ? '∞' : Number(stats.range || 0).toFixed(1)}</strong></span><span><small>PATHS</small><strong>${pathsUsed}<i> / ${pathLimit}</i></strong></span></div><div class="upgrade-heading"><strong>Make a little magic</strong><span>${icons.leaf}${n(game.points)} points</span></div><div class="upgrade-paths">${def.paths.map((path, index) => {
      const level = levels[index] || 0;
      const costs = path.costs || [8, 15, 25];
      const maxed = level >= costs.length;
      const locked = level === 0 && pathsUsed >= pathLimit;
      const cost = costs[level];
      return `<button class="upgrade-path ${level > 0 ? 'invested' : ''} ${locked ? 'path-locked' : ''}" data-upgrade="${index}" ${maxed || locked || game.points < cost ? 'disabled' : ''} title="${esc(path.description)}"><span class="upgrade-copy"><strong>${esc(path.name)}</strong><small>${esc(path.description)}</small><span class="upgrade-pips">${costs.map((_, p) => `<i class="${p < level ? 'filled' : ''}"></i>`).join('')}</span></span><span class="upgrade-price">${locked ? 'Locked' : maxed ? 'MAX' : `${n(cost)}<small>POINTS</small>`}</span></button>`;
    }).join('')}</div><div class="selection-footer"><span>${def.paths.length > 2 ? 'Only 2 paths per guardian. Choose wisely!' : def.paths.length === 1 ? 'One path. A whole flurry of possibilities.' : 'Specialize in power, speed, or a little of both.'}</span><button class="sell-button" data-sell>Sell gnome</button></div>`;
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
    this.openModal('maps', `<div class="modal-heading"><div><span class="eyebrow">FIVE LITTLE WORLDS</span><h2>Find your patch of paradise.</h2></div><button class="modal-close" data-close aria-label="Close map selection">×</button></div><p class="modal-intro">Every garden has a different path to victory. Changing gardens starts a fresh run; your unlocked gnomes stay with you.</p><div class="map-grid">${MAPS.map((map, index) => `<button class="map-card ${map.id === currentId ? 'current' : ''}" data-map="${map.id}"><span class="map-number">0${index + 1}</span><span class="map-difficulty">${esc(map.difficulty || 'GARDEN')}</span><h3>${esc(map.name)}</h3><p>${esc(map.description || map.subtitle)}</p><span class="map-card-foot">${map.id === currentId ? 'Current garden · Restart' : 'Explore garden'} <b>↗</b></span></button>`).join('')}</div>`);
  }
  showHelp() {
    this.openModal('help', `<div class="modal-heading"><div><span class="eyebrow">THE GNOMEWARD FIELD GUIDE</span><h2>Good things take a little growing.</h2></div><button class="modal-close" data-close aria-label="Close field guide">×</button></div><div class="help-steps"><article><span>01</span><div><h3>Plant your defenders</h3><p>Choose a gnome from your crew and click an open patch of grass. Keep the path clear! Their range ring shows where they can reach.</p></div></article><article><span>02</span><div><h3>Stand against the skeletons</h3><p>Start each wave when you're ready. Skeleton colors signal different health and speed. Don't let them reach the garden gate. You can build and upgrade during a wave.</p></div></article><article><span>03</span><div><h3>Grow your own strategy</h3><p>Earn gold for new gnomes and points for upgrades. Most guardians have four paths, but each individual gnome can only use two. Morel plants poison mushrooms; Bramble turns defeated enemies into explosions.</p></div></article><article><span>04</span><div><h3>Meet the whole crew</h3><p>Defeat the wave 10 boss to unlock the pink stun gun. Later victories unlock the multi-attack specialist and a guardian with range across the entire map. Unlocks are saved in this browser.</p></div></article></div><div class="help-note"><strong>A garden for everyone.</strong><span>Use the speed button to pick your pace, pause whenever you need, and press Esc to cancel placement. Survive 20 waves to save a garden.</span></div><button class="primary-button" data-close>LET'S GROW SOMETHING GOOD <span>↗</span></button>`);
  }
  showResult(game) {
    const won = game.status === 'won';
    this.openModal('result', `<div class="result-card"><span class="eyebrow">${won ? 'A WELL-TENDED VICTORY' : 'EVERY GARDENER STARTS SOMEWHERE'}</span><h2>${won ? 'Small gnomes.<br>Enormous victory.' : 'Time to plant<br>a new strategy.'}</h2><p>${won ? 'The garden is safe, and your little guardians have earned a very big rest.' : `Your guardians held on through wave ${game.wave}. Try covering a bend with mushrooms and giving Sprout an upgrade.`}</p><div class="result-stats"><span><strong>${game.wave}</strong><small>WAVES</small></span><span><strong>${game.towers.length}</strong><small>GUARDIANS</small></span><span><strong>${n(game.lives)}</strong><small>LIVES LEFT</small></span></div><button class="primary-button" data-restart>PLANT ANOTHER STRATEGY ↗</button><button class="text-button" data-maps>Explore the other gardens</button><button class="text-button" data-close>Take a look around</button></div>`);
  }
  toast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast'; toast.textContent = message;
    const stack = document.getElementById('toast-stack');
    stack.append(toast);
    while (stack.children.length > 3) stack.firstElementChild.remove();
    setTimeout(() => { toast.classList.add('leaving'); setTimeout(() => toast.remove(), 250); }, 4200);
  }
}
