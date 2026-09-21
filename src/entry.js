import './splash.css';

const splash = document.getElementById('splash-screen');
const app = document.getElementById('app');
const solo = document.getElementById('splash-play');
const coop = document.getElementById('splash-coop');
const shop = document.getElementById('splash-shop');
const status = document.getElementById('splash-status');
const retry = document.getElementById('splash-retry');
let entering = false;

document.addEventListener('gnomeward-loading', event => {
  if (entering && !event.detail.ready) status.textContent = event.detail.message;
});
const hero = document.querySelector('.splash-art img');
hero.addEventListener('error', () => {
  splash.classList.add('splash-art-missing');
});
if (hero.complete && !hero.naturalWidth) splash.classList.add('splash-art-missing');

async function enter(mode) {
  if (entering) return;
  entering = true;
  solo.disabled = coop.disabled = shop.disabled = true;
  splash.setAttribute('aria-busy', 'true');
  status.textContent = mode === 'resume' ? 'Rejoining your garden…' : 'Gathering your guardians…';
  app.hidden = false;
  try {
    await import('./main.js');
    if (!window.gnomeward?.ready) throw new Error('The garden could not load. Please try again in a browser with WebGL 2 enabled.');
    app.inert = false;
    app.removeAttribute('aria-hidden');
    splash.hidden = true;
    window.gnomeward.renderer.resize();
    document.getElementById('scene').focus({ preventScroll: true });
    if (mode === 'coop') document.getElementById('coop-button').click();
    if (mode === 'shop') document.getElementById('coin-shop-button').click();
  } catch (error) {
    entering = false;
    console.error('Could not enter the garden:', error);
    app.hidden = true;
    status.textContent = 'The garden could not load. Check your connection and try again with WebGL 2 enabled.';
    retry.hidden = false;
    retry.focus();
  } finally {
    splash.removeAttribute('aria-busy');
  }
}
solo.addEventListener('click', () => enter('solo'));
coop.addEventListener('click', () => enter('coop'));
shop.addEventListener('click', () => enter('shop'));
retry.addEventListener('click', () => location.reload());

// A reload during co-op must reconnect without another Play click.
try {
  const session = JSON.parse(sessionStorage.getItem('gnomeward-coop-session') || 'null');
  if (session?.token && session?.url) enter('resume');
} catch {}
