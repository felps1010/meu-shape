// Aba Pratos: receitas com ingredientes em gramas + rendimento; o app calcula por porção.
import { state, save, uid } from '../store.js';
import { esc, $, toast, openSheet, confirmSheet } from '../ui.js';
import { getFood, searchFoods, pratoAsFood, macrosFor, fmt } from '../foods.js';

export function renderPratos(view) {
  const draw = () => {
    view.innerHTML = `
      <div class="page-head"><div><div class="sub">Ficam disponíveis no diário e para a IA</div><h1>Pratos</h1></div>
        <button class="btn primary small" data-novo>+ Novo prato</button></div>
      ${state.pratos.length ? state.pratos.map((p) => {
        const f = pratoAsFood(p);
        const m = macrosFor(f, f.porcaoG);
        return `<div class="card tight" data-edit="${p.id}" style="cursor:pointer">
          <div class="card-head"><h3>${esc(p.nome)}</h3><span class="num"><b>${fmt.k(m.kcal)}</b> <small class="muted">kcal/porção</small></span></div>
          <small>${p.porcoes} porç${p.porcoes > 1 ? 'ões' : 'ão'} de ~${fmt.int(f.porcaoG)} g · P ${fmt.int(m.p)} g · C ${fmt.int(m.c)} g · G ${fmt.int(m.g)} g por porção</small>
          <small>${p.ingredientes.map((i) => esc(getFood(i.foodId)?.nome.split(',')[0] || '?')).join(', ')}</small>
        </div>`;
      }).join('') : `<div class="card"><div class="empty"><div style="font-size:40px">🍲</div>
        <b>Nenhum prato ainda</b><small>Cadastre receitas que você faz sempre — ex.: frango desfiado com purê, escondidinho, strogonoff. Informe os ingredientes crus em gramas e quantas porções rende.</small></div></div>`}`;
  };
  view.onclick = (e) => {
    if (e.target.closest('[data-novo]')) editor(null, draw);
    const ed = e.target.closest('[data-edit]');
    if (ed) editor(ed.dataset.edit, draw);
  };
  draw();
}

function editor(id, redraw) {
  const orig = state.pratos.find((p) => p.id === id);
  const p = orig ? structuredClone(orig) : { id: uid(), nome: '', ingredientes: [], porcoes: 4, pesoFinal: '' };
  openSheet((el, close) => {
    let buscando = false;
    const draw = () => {
      const f = pratoAsFood(p);
      const m = macrosFor(f, f.porcaoG);
      el.innerHTML = `<h2>${orig ? 'Editar prato' : 'Novo prato'}</h2>
        <label class="field">Nome<input type="text" id="nome" value="${esc(p.nome)}" placeholder="ex.: Frango desfiado com purê"></label>
        <div class="grid2">
          <label class="field">Rende (porções)<input type="number" inputmode="numeric" id="porcoes" value="${p.porcoes}"></label>
          <label class="field">Peso final pronto (g)<input type="number" inputmode="numeric" id="peso" value="${p.pesoFinal || ''}" placeholder="opcional"></label>
        </div>
        <small>Se pesar a panela pronta (sem a panela), o cálculo por grama fica mais preciso.</small>
        <h3>Ingredientes</h3>
        <div class="items">${p.ingredientes.map((ing, i) => {
          const fo = getFood(ing.foodId);
          return `<div class="item"><div class="name">${esc(fo?.nome || 'Alimento removido')}<small>${fo ? fmt.k(macrosFor(fo, ing.gramas).kcal) + ' kcal' : ''}</small></div>
            <input type="number" inputmode="decimal" data-g="${i}" value="${ing.gramas}" style="width:84px;padding:8px">
            <small>g</small><button class="icon-btn" data-rm="${i}" aria-label="Remover">✕</button></div>`;
        }).join('') || '<small>Nenhum ingrediente.</small>'}</div>
        ${buscando ? `<input type="search" id="q" placeholder="Buscar ingrediente (ex.: frango peito cru)"><div class="results" id="res"></div>`
          : '<button class="btn" data-add>+ Ingrediente</button>'}
        <div class="stat"><div class="k">Por porção (~${fmt.int(f.porcaoG)} g)</div>
          <div class="v num" style="font-size:17px">${fmt.k(m.kcal)} kcal · P ${fmt.int(m.p)} · C ${fmt.int(m.c)} · G ${fmt.int(m.g)}</div></div>
        <div class="row">${orig ? '<button class="btn danger grow" data-del>Apagar</button>' : ''}<button class="btn primary grow" data-ok>Salvar</button></div>`;
      if (buscando) {
        const q = $('#q', el);
        const list = () => {
          $('#res', el).innerHTML = (q.value ? searchFoods(q.value, 25) : []).filter((x) => x.id !== 'P' + p.id)
            .map((x) => `<button class="result" data-pick="${x.id}"><div class="name">${esc(x.nome)}<small>${fmt.k(x.kcal)} kcal/100 g</small></div></button>`).join('');
        };
        q.addEventListener('input', list);
        q.focus();
      }
    };
    const sync = () => {
      p.nome = $('#nome', el).value.trim();
      p.porcoes = Math.max(1, Number($('#porcoes', el).value) || 1);
      p.pesoFinal = Number($('#peso', el).value) || '';
      el.querySelectorAll('[data-g]').forEach((inp) => { p.ingredientes[inp.dataset.g].gramas = Number(String(inp.value).replace(',', '.')) || 0; });
    };
    el.oninput = (e) => { if (e.target.id !== 'q') { sync(); } };
    el.onchange = (e) => { if (e.target.id !== 'q') { sync(); draw(); } };
    el.onclick = async (e) => {
      const t = e.target;
      if (t.closest('[data-add]')) { sync(); buscando = true; draw(); return; }
      const pick = t.closest('[data-pick]');
      if (pick) { sync(); p.ingredientes.push({ foodId: pick.dataset.pick, gramas: 100 }); buscando = false; draw(); return; }
      const rm = t.closest('[data-rm]');
      if (rm) { sync(); p.ingredientes.splice(Number(rm.dataset.rm), 1); draw(); return; }
      if (t.closest('[data-del]')) {
        if (!(await confirmSheet({ title: 'Apagar prato?', text: 'Registros antigos do diário continuam, mas o prato some da busca e do cardápio.', ok: 'Apagar', danger: true }))) return;
        state.pratos = state.pratos.filter((x) => x.id !== p.id);
        save(); close(); redraw(); return;
      }
      if (t.closest('[data-ok]')) {
        sync();
        if (!p.nome) { toast('Dê um nome ao prato'); return; }
        if (!p.ingredientes.length) { toast('Adicione ingredientes'); return; }
        if (orig) Object.assign(orig, p); else state.pratos.push(p);
        save(); close(); redraw(); toast('Prato salvo');
      }
    };
    draw();
  });
}
