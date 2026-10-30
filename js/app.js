// Ponto de entrada: decide entre onboarding e as abas.
import { state, requestPersistence } from './store.js';
import { $, $$ } from './ui.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderDiario } from './views/diario.js';
import { renderDieta } from './views/dieta.js';
import { renderEvolucao } from './views/evolucao.js';
import { renderPratos } from './views/pratos.js';
import { renderPerfil } from './views/perfil.js';

const VIEWS = { diario: renderDiario, dieta: renderDieta, evolucao: renderEvolucao, pratos: renderPratos, perfil: renderPerfil };

export function go(tab) {
  if (location.hash !== '#' + tab) location.hash = tab;
  else render();
}

export function render() {
  const view = $('#view');
  const tabbar = $('#tabbar');
  view.onclick = view.onchange = view.oninput = null;
  if (!state.profile || location.hash === '#editar-perfil') {
    tabbar.hidden = true;
    view.classList.add('no-tabs');
    renderOnboarding(view, () => go('diario'));
    return;
  }
  const tab = location.hash.slice(1);
  const name = VIEWS[tab] ? tab : 'diario';
  tabbar.hidden = false;
  view.classList.remove('no-tabs');
  $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  view.innerHTML = '';
  VIEWS[name](view);
  window.scrollTo(0, 0);
}

$('#tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) go(b.dataset.tab);
});
window.addEventListener('hashchange', render);
document.addEventListener('app:refresh', render);

render();
requestPersistence();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
