// Aba Dieta: cardápio da semana sugerido pelo Claude e conferido pela base de alimentos.
import { state, save } from '../store.js';
import { esc, $, toast, openSheet, confirmSheet, icons, DISCLAIMER } from '../ui.js';
import { getFood, rawFactor, fmt } from '../foods.js';
import { dkey, addDays, dow, weekStart, DIAS, DAY_TYPES, metaDoDia, slotTarget, escalarOpcao, alcoolSemanal } from '../calc.js';
import { gerarCardapio, trocarRefeicao } from '../ai.js';

let diaSel = dkey();
let gerando = false;
let erro = '';

// Opção escolhida para uma refeição num dia, com porções ajustadas à meta daquele dia.
export function planoDoDia(k, slotId) {
  const ops = state.plano?.slots?.[slotId];
  if (!ops?.length) return null;
  const idx = escolha(k, slotId);
  return { ...escalarOpcao(ops[idx], slotTarget(k, slotId)), idx };
}

function escolha(k, slotId) {
  const ops = state.plano.slots[slotId];
  const salvo = state.plano.escolhas?.[`${dow(k)}|${slotId}`];
  if (salvo != null && salvo < ops.length) return salvo;
  return ((dow(k) + 6) % 7) % ops.length; // varia ao longo da semana
}

async function gerar(extra) {
  if (gerando) return;
  gerando = true; erro = '';
  refresh();
  try {
    const plano = await gerarCardapio(extra);
    state.plano = plano;
    save();
    toast('Cardápio pronto!');
  } catch (e) {
    erro = e.message;
  } finally {
    gerando = false;
    refresh();
  }
}

const refresh = () => { if (location.hash === '#dieta') document.dispatchEvent(new Event('app:refresh')); };

export function renderDieta(view) {
  const plano = state.plano;
  const semKey = !state.config.apiKey;
  const seg = weekStart(dkey());

  if (!plano || gerando) {
    view.innerHTML = `
      <div class="page-head"><div><div class="sub">Sugerido pelo Claude, conferido pela TACO</div><h1>Dieta</h1></div></div>
      ${erro ? `<div class="notice"><span><b>Não deu certo:</b> ${esc(erro)}</span></div>` : ''}
      ${semKey ? keyNotice() : ''}
      <div class="card">
        ${gerando ? `<div class="empty"><div class="spinner" style="color:var(--accent);width:28px;height:28px"></div>
          <b>Montando seu cardápio…</b><small>Isso leva 1–2 minutos. Pode navegar pelas outras abas.</small></div>` : `
        <div class="empty" style="padding-bottom:4px">
          <div style="font-size:40px">🍽️</div>
          <b>Seu cardápio da semana</b>
          <small>O Claude escolhe alimentos e porções respeitando suas metas, horários, preferências e orçamento. O app confere cada item na base TACO e recalcula os macros.</small>
        </div>
        <label class="field">Algum pedido? (opcional)<input type="text" id="extra" placeholder="ex.: mais opções com ovo no café"></label>
        <button class="btn primary block" data-act="gerar" ${semKey ? 'disabled' : ''}>${icons.spark.replace('<svg', '<svg width="18" height="18" style="fill:currentColor"')} Gerar meu cardápio</button>`}
      </div>
      <p class="disclaimer">${DISCLAIMER}</p>`;
    view.onclick = (e) => {
      if (e.target.closest('[data-act=gerar]')) gerar($('#extra', view)?.value.trim());
      if (e.target.closest('[data-act=perfil]')) location.hash = 'perfil';
    };
    return;
  }

  if (diaSel < seg || diaSel > addDays(seg, 6)) diaSel = dkey();
  const meta = metaDoDia(diaSel);
  const refs = state.profile.refeicoes;
  const doDia = refs.map((r) => [r, planoDoDia(diaSel, r.id)]);
  const tot = doDia.reduce((a, [, p]) => p ? { kcal: a.kcal + p.tot.kcal, p: a.p + p.tot.p, c: a.c + p.tot.c, g: a.g + p.tot.g } : a, { kcal: 0, p: 0, c: 0, g: 0 });
  const alc = alcoolSemanal();
  const criado = new Date(plano.criadoEm);

  view.innerHTML = `
    <div class="page-head"><div><div class="sub">Gerado em ${criado.getDate()}/${criado.getMonth() + 1} · ajustado ao seu dia</div><h1>Dieta</h1></div>
      <button class="btn small" data-act="novo">${icons.spark.replace('<svg', '<svg width="16" height="16" style="fill:currentColor"')} Novo</button></div>
    ${erro ? `<div class="notice"><span><b>Não deu certo:</b> ${esc(erro)}</span></div>` : ''}

    <div class="day-tabs">${[0, 1, 2, 3, 4, 5, 6].map((i) => {
      const k = addDays(seg, i);
      return `<button class="${k === diaSel ? 'on' : ''} ${k === dkey() ? 'today' : ''}" data-dia="${k}">${DIAS[dow(k)]}<small>${DAY_TYPES[metaDoDia(k).tipo].icon}</small></button>`;
    }).join('')}</div>

    <div class="card tight">
      <div class="card-head"><h3>${DAY_TYPES[meta.tipo].icon} ${DAY_TYPES[meta.tipo].nome}</h3>
        <span class="num"><b>${fmt.k(tot.kcal)}</b> <small class="muted">/ ${fmt.k(meta.kcal)} kcal</small></span></div>
      <div class="grid3">
        <div class="stat"><div class="v num" style="font-size:16px;color:var(--prot)">${fmt.int(tot.p)} g</div><div class="k">prot. / ${fmt.int(meta.p)}</div></div>
        <div class="stat"><div class="v num" style="font-size:16px;color:var(--carb)">${fmt.int(tot.c)} g</div><div class="k">carb. / ${fmt.int(meta.c)}</div></div>
        <div class="stat"><div class="v num" style="font-size:16px;color:var(--fat)">${fmt.int(tot.g)} g</div><div class="k">gord. / ${fmt.int(meta.g)}</div></div>
      </div>
      ${meta.alcoolHoje ? `<small>🍸 + ${fmt.k(meta.alcoolHoje)} kcal de ${esc(state.profile.prefs.alcool.bebida.toLowerCase())} hoje (já previstos no saldo da semana).</small>` : ''}
    </div>

    ${doDia.map(([r, p]) => p ? slotCard(r, p) : `<div class="card"><h3>${esc(r.nome)}</h3><small>Sem opções para esta refeição — gere um novo cardápio.</small></div>`).join('')}

    ${alc.total ? `<div class="card tight"><h2>🍸 Fim de semana</h2>
      <p style="font-size:14px">${esc(state.profile.prefs.alcool.bebida)}: ${state.profile.prefs.alcool.doses} dose(s) ≈ <b>${fmt.k(alc.kcalDia)} kcal</b> por dia de bebida
      (${fmt.k(alc.total)} kcal/semana). Para caber no saldo semanal, cada dia tem <b>~${fmt.k(alc.porDia)} kcal a menos</b> de carboidrato na comida — a proteína fica igual.</p>
      ${plano.estrategia ? `<p class="muted" style="font-size:14px">${esc(plano.estrategia)}</p>` : ''}</div>` : ''}

    <details class="card tight"><summary><h2 style="display:inline">🛒 Lista de compras da semana</h2></summary>${listaCompras(seg)}</details>

    ${plano.preparo?.length ? `<details class="card tight"><summary><h2 style="display:inline">🥡 Preparo das marmitas</h2></summary>
      <ol class="steps">${plano.preparo.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}

    ${plano.dicas?.length ? `<div class="card tight"><h2>Dicas</h2><ul class="plain">${plano.dicas.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    ${plano.problemas?.length ? `<small class="muted">Conferência: ${plano.problemas.length} item(ns) da IA não existiam na base e foram removidos.</small>` : ''}
    <p class="disclaimer">${DISCLAIMER}</p>`;

  view.onclick = async (e) => {
    const t = e.target;
    const d = t.closest('[data-dia]');
    if (d) { diaSel = d.dataset.dia; refresh(); return; }
    const op = t.closest('[data-op]');
    if (op) {
      const [slot, idx] = op.dataset.op.split('|');
      (state.plano.escolhas ||= {})[`${dow(diaSel)}|${slot}`] = Number(idx);
      save(); refresh(); return;
    }
    const tr = t.closest('[data-trocar]');
    if (tr) { trocarSheet(tr.dataset.trocar); return; }
    if (t.closest('[data-act=novo]')) {
      const ok = await confirmSheet({ title: 'Gerar novo cardápio?', text: 'O cardápio atual será substituído. Seu diário não muda.', ok: 'Gerar novo' });
      if (ok) { state.plano = null; save(); gerar(''); }
    }
  };
}

function keyNotice() {
  return `<div class="notice"><span><b>Falta a chave da API do Claude.</b> Para gerar cardápios, cole sua chave em Perfil → Inteligência artificial.</span>
    <button class="btn small" data-act="perfil">Ir para o Perfil</button></div>`;
}

function slotCard(r, p) {
  const ops = state.plano.slots[r.id];
  return `<div class="card meal">
    <div class="meal-head"><div class="grow"><div class="meal-time">${esc(r.hora)} · ${esc(r.nome)}${r.marmita ? ' · marmita' : ''}</div>
      <div class="meal-title">${esc(p.nome)}</div></div>
      <div class="num" style="text-align:right"><b>${fmt.k(p.tot.kcal)}</b> <small class="muted">kcal</small><br><small class="muted">P ${fmt.int(p.tot.p)} g</small></div></div>
    <div class="chips">${ops.map((o, i) => `<button class="chip ${i === p.idx ? 'on' : ''}" data-op="${r.id}|${i}">Opção ${i + 1}</button>`).join('')}
      <button class="chip" data-trocar="${r.id}">${'↻'} Trocar esta refeição</button></div>
    <div class="items">${p.itens.map((it) => `<div class="item"><div class="name">${esc(it.food.nome)}
      <small>${it.gramas} g${it.medida ? ' · ' + esc(it.medida) : ''}</small></div><div class="kc num">${fmt.k(it.kcal)}</div></div>`).join('')}</div>
    ${p.preparo ? `<small>${esc(p.preparo)}</small>` : ''}
  </div>`;
}

function trocarSheet(slotId) {
  const r = state.profile.refeicoes.find((x) => x.id === slotId);
  const atual = planoDoDia(diaSel, slotId);
  openSheet((el, close) => {
    el.innerHTML = `<h2>Trocar: ${esc(r.nome)}</h2>
      <p class="muted" style="font-size:14px">O Claude sugere uma refeição nova com as mesmas calorias (~${fmt.k(atual.tot.kcal)} kcal) e proteína. Ela entra como mais uma opção.</p>
      <label class="field">Quer algo específico? (opcional)<input type="text" id="ped" placeholder="ex.: com macarrão, sem peixe"></label>
      <button class="btn primary block" data-ok>${icons.spark.replace('<svg', '<svg width="18" height="18" style="fill:currentColor"')} Sugerir equivalente</button>`;
    el.onclick = async (e) => {
      const b = e.target.closest('[data-ok]');
      if (!b) return;
      b.disabled = true;
      b.innerHTML = '<span class="spinner"></span> Pensando…';
      try {
        const op = await trocarRefeicao(r, state.plano.slots[slotId][atual.idx], atual.tot.kcal, $('#ped', el).value.trim());
        state.plano.slots[slotId].push(op);
        state.plano.escolhas[`${dow(diaSel)}|${slotId}`] = state.plano.slots[slotId].length - 1;
        save(); close(); refresh(); toast('Nova opção adicionada');
      } catch (err) {
        toast(err.message, 4000);
        b.disabled = false; b.textContent = 'Tentar de novo';
      }
    };
  });
}

// Soma as porções da semana (opções escolhidas em cada dia) e converte para peso cru aproximado.
function listaCompras(seg) {
  const acc = new Map();
  const somar = (id, g) => acc.set(id, (acc.get(id) || 0) + g);
  for (let i = 0; i < 7; i++) {
    const k = addDays(seg, i);
    for (const r of state.profile.refeicoes) {
      const p = planoDoDia(k, r.id);
      if (!p) continue;
      for (const it of p.itens) {
        if (it.food.id[0] === 'P') {
          const prato = state.pratos.find((x) => 'P' + x.id === it.food.id);
          const tot = it.food.totais.peso || 1;
          prato?.ingredientes.forEach((ing) => somar(ing.foodId, (ing.gramas * it.gramas) / tot));
        } else somar(it.food.id, it.gramas);
      }
    }
  }
  const alc = state.profile.prefs?.alcool;
  if (alc?.ativo && alc.dias.length) somar('X2', alc.doses * 50 * alc.dias.length);
  const grupos = {};
  for (const [id, g] of acc) {
    const f = getFood(id);
    if (!f) continue;
    const cru = g * rawFactor(f);
    (grupos[f.cat] ||= []).push({ f, cru, pronto: g });
  }
  const qt = (g, f) => {
    const ml = f && /^X[23]$/.test(f.id);
    return g >= 1000 ? `${fmt.g(Math.ceil(g / 100) / 10)} ${ml ? 'L' : 'kg'}` : `${Math.ceil(g / 50) * 50} ${ml ? 'ml' : 'g'}`;
  };
  const cats = Object.keys(grupos).sort();
  if (!cats.length) return '<small>Nada no plano ainda.</small>';
  return cats.map((c) => `<div class="stack" style="gap:2px;margin-top:8px"><small><b>${esc(c)}</b></small>
    <div class="items">${grupos[c].sort((a, b) => b.cru - a.cru).map(({ f, cru, pronto }) => `<div class="item">
      <div class="name">${esc(f.nome.replace(/, (cozid|grelhad|assad|refogad)[oa]s?.*$/i, ''))}
      ${rawFactor(f) !== 1 ? `<small>cru · rende ~${qt(pronto)} pronto</small>` : ''}</div>
      <div class="kc num">${qt(cru, f)}</div></div>`).join('')}</div></div>`).join('')
    + '<small class="muted">Quantidades aproximadas para 7 dias (peso cru quando o alimento é cozido).</small>';
}
