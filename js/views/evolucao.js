// Aba Evolução: registro de peso/cintura/% gordura, gráfico com média móvel, ritmo e projeção.
import { state, save } from '../store.js';
import { esc, $, toast, openSheet, confirmSheet, icons } from '../ui.js';
import { fmt } from '../foods.js';
import { dkey, addDays, parseKey, daysBetween, movingAverage, pesagensOrdenadas, pesoAtual, ritmo, projecao, verificarAjuste, aplicarRevisao, metaDoDia } from '../calc.js';

let range = 60;

// Card da revisão a cada 14 dias (aparece também no Diário).
export function revisaoCard(rev) {
  const sinal = rev.delta > 0 ? '+' : '−';
  if (!rev.delta) {
    return `<div class="notice"><span><b>Revisão de 14 dias:</b> ritmo de ${fmt.g(Math.abs(rev.ritmo))} kg/semana
      ${rev.ritmo <= 0 ? 'perdendo' : 'ganhando'} — dentro da faixa. Metas mantidas.</span>
      <button class="btn small" data-rev="0">Ok</button></div>`;
  }
  return `<div class="notice">
    <span><b>Ajuste sugerido: ${sinal}${Math.abs(rev.delta)} kcal/dia</b></span>
    <span>${esc(rev.motivo)} Base: ${rev.pontos} pesagens nos últimos 14 dias.</span>
    <div class="row"><button class="btn small grow" data-rev="0">Manter como está</button>
      <button class="btn small primary grow" data-rev="1">Aplicar ajuste</button></div></div>`;
}

export function handleRevisao(e, redraw) {
  const b = e.target.closest('[data-rev]');
  if (!b) return false;
  const rev = verificarAjuste();
  if (rev) {
    const aceito = b.dataset.rev === '1';
    aplicarRevisao(rev, aceito);
    save();
    toast(aceito && rev.delta ? `Meta ajustada: ${rev.delta > 0 ? '+' : '−'}${Math.abs(rev.delta)} kcal/dia` : 'Ok, metas mantidas');
  }
  redraw();
  return true;
}

function chart(list) {
  const W = 340, H = 200, L = 34, R = 8, T = 10, B = 22;
  if (list.length < 2) return '<div class="empty">Registre pelo menos 2 pesagens para ver o gráfico.</div>';
  const meta = state.profile.pesoMeta;
  const ys = list.flatMap((x) => [x.peso, x.media]);
  if (meta && Math.abs(meta - list[list.length - 1].media) < 6) ys.push(meta);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max - min < 2) { min -= 1; max += 1; }
  min = Math.floor(min - 0.3); max = Math.ceil(max + 0.3);
  const d0 = list[0].data;
  const span = Math.max(1, daysBetween(d0, list[list.length - 1].data));
  const x = (k) => L + (daysBetween(d0, k) / span) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const step = Math.max(1, Math.ceil((max - min) / 4));
  const grid = [];
  for (let v = min; v <= max; v += step) {
    grid.push(`<line class="axis" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="lbl" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`);
  }
  const fmtD = (k) => { const d = parseKey(k); return `${d.getDate()}/${d.getMonth() + 1}`; };
  const xl = [list[0].data, list[Math.floor(list.length / 2)].data, list[list.length - 1].data]
    .map((k, i) => `<text class="lbl" x="${x(k)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${fmtD(k)}</text>`);
  const path = list.map((p, i) => `${i ? 'L' : 'M'}${x(p.data).toFixed(1)},${y(p.media).toFixed(1)}`).join('');
  const goal = meta && meta >= min && meta <= max ? `<line class="goal" x1="${L}" x2="${W - R}" y1="${y(meta)}" y2="${y(meta)}"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de peso">
    ${grid.join('')}${goal}
    ${list.map((p) => `<circle class="pt" cx="${x(p.data)}" cy="${y(p.peso)}" r="3"/>`).join('')}
    <path class="avg" d="${path}"/>${xl.join('')}</svg>`;
}

export function renderEvolucao(view) {
  const draw = () => {
    const todas = movingAverage();
    const hoje = dkey();
    const list = range ? todas.filter((p) => daysBetween(p.data, hoje) < range) : todas;
    const atual = pesoAtual();
    const r = ritmo(14);
    const proj = projecao();
    const primeiro = todas[0];
    const rev = verificarAjuste();
    const ultCint = [...todas].reverse().find((p) => p.cintura);
    const ultGord = [...todas].reverse().find((p) => p.gordura);
    const m = metaDoDia(hoje);

    let projTxt = '—', projSub = 'defina um peso meta no Perfil';
    if (state.profile.pesoMeta) {
      if (!proj) { projSub = 'precisa de ~1 semana de pesagens'; }
      else if (proj.atingida) { projTxt = 'Meta!'; projSub = 'você chegou no peso meta 🎉'; }
      else if (proj.semRumo) { projTxt = '—'; projSub = `o ritmo atual não leva aos ${fmt.g(state.profile.pesoMeta)} kg`; }
      else { const d = parseKey(proj.data); projTxt = `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`; projSub = `${fmt.g(state.profile.pesoMeta)} kg em ~${Math.round(proj.semanas)} semanas`; }
    }

    view.innerHTML = `
      <div class="page-head"><div><div class="sub">Peso em jejum, de preferência todo dia</div><h1>Evolução</h1></div>
        <button class="btn primary small" data-act="add">+ Pesagem</button></div>

      ${rev ? revisaoCard(rev) : ''}

      <div class="grid2">
        <div class="stat"><div class="v num">${fmt.g(atual)} kg</div><div class="k">média 7 dias</div></div>
        <div class="stat"><div class="v num">${r ? (r.kgSemana > 0 ? '+' : '') + fmt.g(r.kgSemana) : '—'}</div><div class="k">kg/semana (últimos 14 dias)</div></div>
        <div class="stat"><div class="v num">${primeiro ? (atual - primeiro.peso > 0 ? '+' : '') + fmt.g(atual - primeiro.peso) + ' kg' : '—'}</div><div class="k">desde ${primeiro ? fmtData(primeiro.data) : 'o início'}</div></div>
        <div class="stat"><div class="v num">${projTxt}</div><div class="k">${esc(projSub)}</div></div>
      </div>

      <div class="card chart">
        <div class="card-head"><h2>Peso</h2>
          <div class="chips">${[[30, '30d'], [60, '60d'], [180, '6m'], [0, 'Tudo']].map(([v, l]) => `<button class="chip ${range === v ? 'on' : ''}" data-range="${v}">${l}</button>`).join('')}</div></div>
        ${chart(list)}
        <div class="legend"><span><i style="background:var(--muted);opacity:.55;border-radius:50%"></i>pesagem</span>
          <span><i style="background:var(--accent)"></i>média 7 dias</span>
          ${state.profile.pesoMeta ? '<span><i style="background:var(--carb)"></i>meta</span>' : ''}</div>
        <small>Oscilação de 0,5–1,5 kg de um dia para o outro é normal (água, sal, intestino). Olhe a linha verde.</small>
      </div>

      ${(ultCint || ultGord) ? `<div class="grid2">
        ${ultCint ? `<div class="stat"><div class="v num">${fmt.g(ultCint.cintura)} cm</div><div class="k">cintura · ${fmtData(ultCint.data)}</div></div>` : ''}
        ${ultGord ? `<div class="stat"><div class="v num">${fmt.g(ultGord.gordura)}%</div><div class="k">gordura · ${fmtData(ultGord.data)}</div></div>` : ''}
      </div>` : ''}

      <div class="card tight">
        <div class="card-head"><h2>Metas atuais</h2><small>${state.profile.ajusteKcal ? `ajuste acumulado ${state.profile.ajusteKcal > 0 ? '+' : ''}${state.profile.ajusteKcal} kcal` : 'sem ajustes'}</small></div>
        <small>Hoje: ${fmt.k(m.kcal)} kcal · P ${fmt.int(m.p)} g · C ${fmt.int(m.c)} g · G ${fmt.int(m.g)} g. Gasto estimado ${fmt.k(m.gasto)} kcal.
        Próxima revisão automática: ${proxRevisao()}.</small>
        ${state.ajustes.length ? `<div class="items">${[...state.ajustes].reverse().slice(0, 5).map((a) => `
          <div class="item"><div class="name">${fmtData(a.data)} · ${a.delta ? (a.aceito ? 'aplicado' : 'recusado') : 'sem mudança'}<small>${esc(a.motivo)}</small></div>
          <div class="kc num">${a.delta ? (a.delta > 0 ? '+' : '') + a.delta : '0'} kcal</div></div>`).join('')}</div>` : ''}
      </div>

      <div class="card tight">
        <h2>Registros</h2>
        ${todas.length ? `<div class="items">${[...todas].reverse().slice(0, 40).map((p) => `
          <div class="item" data-edit="${p.data}" style="cursor:pointer"><div class="name">${fmtData(p.data)}
            <small>${[p.cintura ? `cintura ${fmt.g(p.cintura)} cm` : '', p.gordura ? `gordura ${fmt.g(p.gordura)}%` : '', `média ${fmt.g(p.media)} kg`].filter(Boolean).join(' · ')}</small></div>
            <div class="kc num">${fmt.g(p.peso)} kg</div></div>`).join('')}</div>` : '<small>Nenhuma pesagem ainda.</small>'}
      </div>`;
  };

  view.onclick = (e) => {
    if (handleRevisao(e, draw)) return;
    const rg = e.target.closest('[data-range]');
    if (rg) { range = Number(rg.dataset.range); draw(); return; }
    if (e.target.closest('[data-act=add]')) { pesagemSheet(null, draw); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) pesagemSheet(ed.dataset.edit, draw);
  };
  draw();
}

function proxRevisao() {
  const p = state.profile;
  const base = p.ultimaRevisao || p.criadoEm;
  const k = addDays(base, 14);
  return k <= dkey() ? 'assim que houver pesagens suficientes (4+ em 10 dias)' : fmtData(k);
}

const fmtData = (k) => { const d = parseKey(k); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

function pesagemSheet(data, redraw) {
  const atual = data ? state.pesagens.find((p) => p.data === data) : null;
  const ult = pesagensOrdenadas().at(-1);
  openSheet((el, close) => {
    el.innerHTML = `<h2>${atual ? 'Editar pesagem' : 'Nova pesagem'}</h2>
      <label class="field">Data<input type="date" id="d" value="${atual?.data || dkey()}" max="${dkey()}"></label>
      <label class="field">Peso (kg) — em jejum, depois do banheiro<input type="number" inputmode="decimal" step="0.1" id="p" value="${atual?.peso ?? ult?.peso ?? ''}"></label>
      <div class="grid2">
        <label class="field">Cintura (cm)<input type="number" inputmode="decimal" step="0.5" id="c" value="${atual?.cintura ?? ''}" placeholder="opcional"></label>
        <label class="field">% gordura<input type="number" inputmode="decimal" step="0.1" id="g" value="${atual?.gordura ?? ''}" placeholder="bioimpedância"></label>
      </div>
      <div class="row">${atual ? '<button class="btn danger grow" data-del>Apagar</button>' : ''}<button class="btn primary grow" data-ok>Salvar</button></div>`;
    const num = (id) => { const v = $(id, el).value; return v === '' ? null : Number(String(v).replace(',', '.')); };
    el.onclick = async (e) => {
      if (e.target.closest('[data-del]')) {
        if (!(await confirmSheet({ title: 'Apagar pesagem?', text: fmtData(data), ok: 'Apagar', danger: true }))) return;
        state.pesagens = state.pesagens.filter((p) => p.data !== data);
        save(); close(); redraw(); return;
      }
      if (!e.target.closest('[data-ok]')) return;
      const d = $('#d', el).value || dkey();
      const peso = num('#p');
      if (!(peso > 30 && peso < 300)) { toast('Informe um peso válido'); return; }
      const reg = { data: d, peso };
      const c = num('#c'); const g = num('#g');
      if (c) reg.cintura = c;
      if (g) reg.gordura = g;
      state.pesagens = state.pesagens.filter((p) => p.data !== d && p.data !== data);
      state.pesagens.push(reg);
      save(); close(); redraw(); toast('Pesagem salva');
    };
  });
}
