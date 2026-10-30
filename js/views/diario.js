// Aba Diário: painel do dia, "comi" em 1 toque, registro livre e resumo semanal.
import { state, save, uid } from '../store.js';
import { esc, $, toast, openSheet, ring, bar, icons, DISCLAIMER } from '../ui.js';
import { getFood, macrosFor, searchFoods, touchRecent, quickPortions, sumMacros, fmt } from '../foods.js';
import { dkey, addDays, parseKey, DIAS_LONGOS, DAY_TYPES, metaDoDia, slotTarget, weekStart, verificarAjuste } from '../calc.js';
import { planoDoDia } from './dieta.js';
import { revisaoCard, handleRevisao } from './evolucao.js';

let dia = dkey();

export const entriesOf = (k) => state.diario[k] || [];

function addEntry(k, e) {
  (state.diario[k] ||= []).push({ id: uid(), ...e });
}

function labelDia(k) {
  const hoje = dkey();
  if (k === hoje) return 'Hoje';
  if (k === addDays(hoje, -1)) return 'Ontem';
  if (k === addDays(hoje, 1)) return 'Amanhã';
  const d = parseKey(k);
  return `${DIAS_LONGOS[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
}

export function renderDiario(view) {
  const draw = () => {
    const meta = metaDoDia(dia);
    const ents = entriesOf(dia);
    const tot = sumMacros(ents);
    const totComida = sumMacros(ents.filter((e) => !e.alcool));
    const alvoTotal = meta.kcal + meta.alcoolHoje;
    const resta = alvoTotal - tot.kcal;
    const refs = state.profile.refeicoes;
    const outros = ents.filter((e) => !refs.some((r) => r.id === e.slot));
    const rev = dia === dkey() ? verificarAjuste() : null;

    view.innerHTML = `
      <div class="page-head">
        <div><div class="sub">${DAY_TYPES[meta.tipo].icon} Dia de ${DAY_TYPES[meta.tipo].nome.toLowerCase()}</div><h1>${labelDia(dia)}</h1></div>
        <div class="row"><button class="icon-btn" data-nav="-1" aria-label="Dia anterior">${icons.left}</button>
          <button class="icon-btn" data-nav="1" aria-label="Próximo dia">${icons.right}</button></div>
      </div>

      ${rev ? revisaoCard(rev) : ''}

      <div class="card">
        <div class="ring-wrap">
          <div class="ring">${ring(tot.kcal, alvoTotal)}
            <div class="center"><div><div class="big num ${resta < 0 ? 'over' : ''}">${fmt.k(Math.abs(resta))}</div>
              <div class="lbl">${resta >= 0 ? 'kcal restantes' : 'kcal acima'}</div></div></div></div>
          <div class="macros">
            ${bar('kcal', 'Calorias', tot.kcal, alvoTotal, 'kcal')}
            ${bar('prot', 'Proteína', tot.p, meta.p)}
            ${bar('carb', 'Carboidrato', tot.c, meta.c)}
            ${bar('fat', 'Gordura', tot.g, meta.g)}
          </div>
        </div>
        ${meta.alcoolHoje ? `<small>🍸 Inclui ${fmt.k(meta.alcoolHoje)} kcal reservadas para ${esc(state.profile.prefs.alcool.bebida.toLowerCase())}. Comida: ${fmt.k(totComida.kcal)} / ${fmt.k(meta.kcal)} kcal.</small>` : ''}
      </div>

      ${refs.map((r) => mealCard(r, ents.filter((e) => e.slot === r.id))).join('')}

      <div class="card tight">
        <div class="card-head"><h3>Extras e bebidas</h3>
          <button class="btn small" data-add="extra">+ Adicionar</button></div>
        ${outros.length ? `<div class="items">${outros.map(itemRow).join('')}</div>` : '<small>Nada registrado.</small>'}
      </div>

      ${semanaCard()}
      <p class="disclaimer">${DISCLAIMER}</p>`;
  };

  const mealCard = (r, list) => {
    const plan = planoDoDia(dia, r.id);
    const tot = sumMacros(list);
    const alvo = slotTarget(dia, r.id);
    const marcado = list.some((e) => e.plano);
    return `<div class="card meal">
      <div class="meal-head">
        <div class="grow"><div class="meal-time">${esc(r.hora)}${r.marmita ? ' · marmita' : ''}</div>
          <div class="meal-title">${esc(r.nome)}</div></div>
        <div class="num" style="text-align:right"><b>${fmt.k(tot.kcal)}</b><small class="muted"> / ${fmt.k(alvo)} kcal</small></div>
      </div>
      ${plan ? `<div class="row" style="background:var(--surface-2);border-radius:12px;padding:10px 12px">
          <div class="grow"><div style="font-weight:650;font-size:14px">${esc(plan.nome)}</div>
            <small>${plan.itens.map((i) => `${esc(shortName(i.food.nome))} ${i.gramas} g`).join(' · ')}</small></div>
          <button class="btn small done-btn ${marcado ? 'on' : ''}" data-comi="${r.id}">${marcado ? '✓ Comi' : 'Comi'}</button>
        </div>` : ''}
      ${list.filter((e) => !e.plano).length || marcado ? `<div class="items">${list.map(itemRow).join('')}</div>` : ''}
      <button class="btn ghost" style="align-self:flex-start" data-add="${r.id}">+ ${plan ? 'Comi outra coisa' : 'Registrar'}</button>
    </div>`;
  };

  const itemRow = (e) => `<div class="item" data-entry="${e.id}" style="cursor:pointer">
      <div class="name">${esc(e.nome)}<small>${fmt.int(e.gramas)} g · P ${fmt.int(e.p)} · C ${fmt.int(e.c)} · G ${fmt.int(e.g)}</small></div>
      <div class="kc num">${fmt.k(e.kcal)} kcal</div></div>`;

  const semanaCard = () => {
    const hoje = dkey();
    const ini = weekStart(dia);
    let metaSum = 0, comido = 0, planOk = 0, planTot = 0, diasOk = 0, diasN = 0;
    // Só entram dias já encerrados e com algo registrado (dia sem registro não é "saldo").
    for (let i = 0; i < 7; i++) {
      const k = addDays(ini, i);
      if (k >= hoje) break;
      const m = metaDoDia(k);
      const ents = entriesOf(k);
      if (!ents.length) continue;
      const kc = sumMacros(ents).kcal;
      metaSum += m.kcal + m.alcoolHoje;
      comido += kc;
      if (state.plano) {
        for (const r of state.profile.refeicoes) {
          if (!planoDoDia(k, r.id)) continue;
          planTot++;
          if (ents.some((e) => e.slot === r.id && e.plano)) planOk++;
        }
      }
      if (ents.length) { diasN++; if (Math.abs(kc - (m.kcal + m.alcoolHoje)) <= (m.kcal + m.alcoolHoje) * 0.1) diasOk++; }
    }
    const saldo = metaSum - comido;
    if (!diasN) {
      return `<div class="card tight"><div class="card-head"><h2>Semana</h2><small>desde segunda</small></div>
        <small>O resumo (saldo, aderência ao plano, dias na meta) aparece a partir do primeiro dia completo registrado.</small></div>`;
    }
    return `<div class="card">
      <div class="card-head"><h2>Semana</h2><small>${diasN} dia(s) registrado(s) até ontem</small></div>
      <div class="grid2">
        <div class="stat"><div class="v num ${saldo < 0 ? 'over' : ''}">${saldo >= 0 ? '' : '+'}${fmt.k(Math.abs(saldo))}</div>
          <div class="k">${saldo >= 0 ? 'kcal de saldo (abaixo da meta)' : 'kcal acima da meta'}</div></div>
        <div class="stat"><div class="v num">${planTot ? Math.round((planOk / planTot) * 100) + '%' : '—'}</div>
          <div class="k">aderência ao plano ${planTot ? `(${planOk}/${planTot})` : ''}</div></div>
        <div class="stat"><div class="v num">${diasN ? `${diasOk}/${diasN}` : '—'}</div><div class="k">dias na meta (±10%)</div></div>
        <div class="stat"><div class="v num">${fmt.k(comido)}</div><div class="k">kcal na semana / ${fmt.k(metaSum)}</div></div>
      </div>
    </div>`;
  };

  view.onclick = (e) => {
    const t = e.target;
    if (handleRevisao(e, draw)) return;
    const nav = t.closest('[data-nav]');
    if (nav) { dia = addDays(dia, Number(nav.dataset.nav)); draw(); return; }
    const comi = t.closest('[data-comi]');
    if (comi) { toggleComi(comi.dataset.comi); draw(); return; }
    const add = t.closest('[data-add]');
    if (add) { addSheet(add.dataset.add, draw); return; }
    const ent = t.closest('[data-entry]');
    if (ent) { editSheet(ent.dataset.entry, draw); return; }
  };
  draw();
}

const shortName = (n) => n.split(',').slice(0, 2).join(',');

function toggleComi(slotId) {
  const list = entriesOf(dia);
  if (list.some((e) => e.slot === slotId && e.plano)) {
    state.diario[dia] = list.filter((e) => !(e.slot === slotId && e.plano));
    save(); toast('Desmarcado');
    return;
  }
  const plan = planoDoDia(dia, slotId);
  for (const it of plan.itens) {
    addEntry(dia, { slot: slotId, foodId: it.food_id, nome: it.food.nome, gramas: it.gramas, kcal: it.kcal, p: it.p, c: it.c, g: it.g, plano: true });
  }
  save(); toast(`✓ ${plan.nome}`);
}

// Registro rápido: buscar → tocar no alimento → tocar na porção.
function addSheet(slotId, redraw) {
  openSheet((el, close) => {
    const slotNome = state.profile.refeicoes.find((r) => r.id === slotId)?.nome || 'Extras e bebidas';
    el.innerHTML = `<div class="row between"><h2>${esc(slotNome)}</h2><small>${labelDia(dia)}</small></div>
      <input type="search" placeholder="Buscar alimento ou prato (ex.: arroz, frango)" autocomplete="off" id="q">
      <div class="results" id="res"></div>`;
    const q = $('#q', el);
    const res = $('#res', el);
    const list = () => {
      const foods = searchFoods(q.value);
      res.innerHTML = foods.length ? foods.map((f) => `<button class="result" data-f="${f.id}">
          <div class="name">${esc(f.nome)}<small>${f.id[0] === 'P' ? 'Meu prato · ' : ''}${fmt.k(f.kcal)} kcal · P ${fmt.g(f.p)} · C ${fmt.g(f.c)} · G ${fmt.g(f.g)} /100 g</small></div></button>`).join('')
        : `<div class="empty">${q.value ? 'Nada encontrado. Tente outra palavra.' : 'Comece a digitar para buscar na TACO e nos seus pratos.'}</div>`;
    };
    q.addEventListener('input', list);
    res.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (b) portionStep(el, getFood(b.dataset.f), slotId, close, redraw);
    });
    list();
    setTimeout(() => q.focus(), 50);
  });
}

function portionStep(el, food, slotId, close, redraw) {
  const porcoes = quickPortions(food);
  el.innerHTML = `<div class="row"><button class="icon-btn" data-back>${icons.left}</button><h2 class="grow">${esc(food.nome)}</h2></div>
    <small>${fmt.k(food.kcal)} kcal · P ${fmt.g(food.p)} · C ${fmt.g(food.c)} · G ${fmt.g(food.g)} por 100 g · ${esc(food.fonte)}</small>
    <div class="chips">${porcoes.map(([l, g]) => `<button class="chip" data-g="${g}">${esc(l)}</button>`).join('')}</div>
    <div class="row"><label class="field grow">Gramas (ou ml)<input type="number" inputmode="decimal" id="gr" value="${Math.round(porcoes[0][1])}"></label></div>
    <div id="prev" class="muted num"></div>
    <button class="btn primary block" data-ok>Adicionar</button>`;
  const gr = $('#gr', el);
  const prev = () => {
    const m = macrosFor(food, Number(gr.value) || 0);
    $('#prev', el).textContent = `${fmt.k(m.kcal)} kcal · P ${fmt.int(m.p)} g · C ${fmt.int(m.c)} g · G ${fmt.int(m.g)} g`;
  };
  const add = (g) => {
    if (!(g > 0)) { toast('Informe a quantidade'); return; }
    const m = macrosFor(food, g);
    addEntry(dia, { slot: slotId, foodId: food.id, nome: food.nome, gramas: g, ...m, alcool: food.id === 'X2' || undefined });
    touchRecent(food.id);
    save(); close(); redraw();
    toast(`+ ${fmt.k(m.kcal)} kcal`);
  };
  gr.addEventListener('input', prev);
  prev();
  el.onclick = (e) => {
    if (e.target.closest('[data-back]')) { close(); addSheet(slotId, redraw); return; }
    const chip = e.target.closest('[data-g]');
    if (chip) { add(Number(chip.dataset.g)); return; }
    if (e.target.closest('[data-ok]')) add(Number(String(gr.value).replace(',', '.')));
  };
}

function editSheet(id, redraw) {
  const list = entriesOf(dia);
  const ent = list.find((e) => e.id === id);
  if (!ent) return;
  const food = getFood(ent.foodId);
  openSheet((el, close) => {
    el.innerHTML = `<h2>${esc(ent.nome)}</h2>
      <label class="field">Gramas (ou ml)<input type="number" inputmode="decimal" id="gr" value="${Math.round(ent.gramas)}" ${food ? '' : 'disabled'}></label>
      <div class="row"><button class="btn danger grow" data-del>Remover</button><button class="btn primary grow" data-ok ${food ? '' : 'disabled'}>Salvar</button></div>`;
    el.onclick = (e) => {
      if (e.target.closest('[data-del]')) {
        state.diario[dia] = list.filter((x) => x.id !== id);
        save(); close(); redraw(); toast('Removido');
      }
      if (e.target.closest('[data-ok]')) {
        const g = Number(String($('#gr', el).value).replace(',', '.'));
        if (!(g > 0)) return;
        Object.assign(ent, { gramas: g, ...macrosFor(food, g) });
        save(); close(); redraw();
      }
    };
  });
}
