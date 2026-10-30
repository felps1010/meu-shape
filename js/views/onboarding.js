// Onboarding (primeira abertura) — também usado para editar o perfil depois.
import { state, save, uid } from '../store.js';
import { esc, $, toast, DISCLAIMER } from '../ui.js';
import { DAY_TYPES, OBJETIVOS, DIAS, metaDoDia, dkey, addDays, weekStart } from '../calc.js';

// Valores iniciais genéricos (o código é público). Tudo editável.
function defaults() {
  return {
    sexo: 'M', idade: '', altura: '', peso: '', cintura: '', gordura: '',
    objetivo: 'perder', pesoMeta: '',
    rotina: { 0: 'descanso', 1: 'musculacao', 2: 'descanso', 3: 'musculacao', 4: 'descanso', 5: 'musculacao', 6: 'descanso' },
    refeicoes: [
      { id: 'cafe', nome: 'Café da manhã', hora: '08:00', marmita: false },
      { id: 'almoco', nome: 'Almoço', hora: '12:30', marmita: false },
      { id: 'lanche', nome: 'Lanche', hora: '16:00', marmita: false },
      { id: 'jantar', nome: 'Jantar', hora: '20:00', marmita: false },
    ],
    prefs: {
      ama: '',
      naoCome: '',
      restricoes: '',
      orcamento: 'medio',
      marmita: false,
      bebidas: '',
      alcool: { ativo: false, bebida: 'Gin com refrigerante zero', dias: [6], doses: 2, kcalDose: 110 },
    },
    ajusteKcal: 0,
  };
}

const STEPS = ['Sobre você', 'Objetivo', 'Rotina', 'Refeições', 'Preferências', 'Suas metas'];

export function renderOnboarding(view, done) {
  const editing = !!state.profile;
  const d = structuredClone(state.profile || defaults());
  let step = 0;

  const draw = () => {
    view.innerHTML = `
      <div class="page-head"><div>
        <div class="sub">${editing ? 'Editar perfil' : 'Bem-vindo! Vamos configurar'} · ${step + 1} de ${STEPS.length}</div>
        <h1>${STEPS[step]}</h1></div>
        ${editing ? '<button class="btn ghost" data-act="cancel">Cancelar</button>' : ''}
      </div>
      <div class="ob-progress">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="card">${body()}</div>
      <div class="ob-actions">
        ${step > 0 ? '<button class="btn" data-act="back">Voltar</button>' : ''}
        <button class="btn primary" data-act="next">${step === STEPS.length - 1 ? (editing ? 'Salvar' : 'Começar') : 'Continuar'}</button>
      </div>
      <p class="disclaimer">${DISCLAIMER}</p>`;
  };

  const seg = (name, value, opts) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) =>
    `<button type="button" data-v="${v}" class="${String(value) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;

  const body = () => {
    if (step === 0) {
      return `
        <label class="field">Sexo ${seg('sexo', d.sexo, [['M', 'Masculino'], ['F', 'Feminino']])}</label>
        <div class="grid2">
          <label class="field">Idade<input type="number" inputmode="numeric" name="idade" value="${d.idade}"></label>
          <label class="field">Altura (cm)<input type="number" inputmode="numeric" name="altura" value="${d.altura}"></label>
          <label class="field">Peso atual (kg)<input type="number" inputmode="decimal" step="0.1" name="peso" value="${d.peso}"></label>
          <label class="field">Cintura (cm) — opcional<input type="number" inputmode="decimal" step="0.5" name="cintura" value="${d.cintura ?? ''}"></label>
          <label class="field">% de gordura — opcional<input type="number" inputmode="decimal" step="0.1" name="gordura" value="${d.gordura ?? ''}"></label>
        </div>`;
    }
    if (step === 1) {
      return `
        <label class="field">Objetivo ${seg('objetivo', d.objetivo, Object.entries(OBJETIVOS).map(([k, v]) => [k, v.nome]))}</label>
        <label class="field">Peso meta (kg) — opcional, usado na projeção<input type="number" inputmode="decimal" step="0.1" name="pesoMeta" value="${d.pesoMeta ?? ''}"></label>
        <p class="muted" style="font-size:13px">Perder gordura usa um déficit de 20% sobre o gasto estimado. A cada 14 dias o app olha a tendência real do seu peso e sugere um ajuste (você confirma).</p>`;
    }
    if (step === 2) {
      return `<p class="muted" style="font-size:13px">O tipo de dia muda as calorias: dia de futebol come mais que dia de descanso.</p>
        <div class="week-grid">${[1, 2, 3, 4, 5, 6, 0].map((i) => `
          <div class="wd"><b>${DIAS[i]}</b>
            <div class="chips" data-dia="${i}">${Object.entries(DAY_TYPES).map(([k, t]) =>
              `<button type="button" class="chip ${d.rotina[i] === k ? 'on' : ''}" data-v="${k}">${t.icon} ${t.nome}</button>`).join('')}</div>
          </div>`).join('')}</div>`;
    }
    if (step === 3) {
      return `<p class="muted" style="font-size:13px">${d.refeicoes.length} refeições por dia. Marque as que vão em marmita.</p>
        <div class="stack" style="gap:12px">${d.refeicoes.map((r, i) => `
          <div class="stack" data-ref="${i}" style="gap:6px;padding-bottom:12px;border-bottom:1px solid var(--line)">
            <div class="row"><input type="text" data-f="nome" value="${esc(r.nome)}" class="grow">
              <input type="time" data-f="hora" value="${esc(r.hora)}" style="width:110px">
              ${d.refeicoes.length > 1 ? `<button type="button" class="icon-btn" data-del="${i}" aria-label="Remover">✕</button>` : ''}</div>
            <label class="row" style="font-size:14px"><input type="checkbox" data-f="marmita" ${r.marmita ? 'checked' : ''}> Levo de marmita</label>
          </div>`).join('')}</div>
        <button type="button" class="btn" data-act="add-ref">+ Adicionar refeição</button>`;
    }
    if (step === 4) {
      const p = d.prefs; const a = p.alcool;
      return `
        <label class="field">Alimentos que você ama<textarea name="ama">${esc(p.ama)}</textarea></label>
        <label class="field">Não como / não gosto<textarea name="naoCome">${esc(p.naoCome)}</textarea></label>
        <label class="field">Restrições (alergias, intolerâncias…)<input type="text" name="restricoes" value="${esc(p.restricoes)}"></label>
        <label class="field">Orçamento ${seg('orcamento', p.orcamento, [['baixo', 'Baixo'], ['medio', 'Médio'], ['alto', 'Alto']])}</label>
        <label class="row" style="font-size:14px"><input type="checkbox" name="marmita" ${p.marmita ? 'checked' : ''}> Levo marmita</label>
        <label class="field">Bebidas do dia a dia<input type="text" name="bebidas" value="${esc(p.bebidas)}"></label>
        <div class="divider"></div>
        <label class="row" style="font-size:14px;font-weight:650"><input type="checkbox" name="alc-ativo" ${a.ativo ? 'checked' : ''}> Bebida alcoólica no fim de semana</label>
        <div class="stack" ${a.ativo ? '' : 'hidden'} id="alc-box">
          <label class="field">O quê<input type="text" name="alc-bebida" value="${esc(a.bebida)}"></label>
          <div class="grid2">
            <label class="field">Doses por dia<input type="number" inputmode="numeric" name="alc-doses" value="${a.doses}"></label>
            <label class="field">kcal por dose<input type="number" inputmode="numeric" name="alc-kcal" value="${a.kcalDose}"></label>
          </div>
          <div class="field" style="font-size:13px;color:var(--muted);font-weight:600">Em quais dias
            <div class="chips" data-alc-dias>${[5, 6, 0].map((i) => `<button type="button" class="chip ${a.dias.includes(i) ? 'on' : ''}" data-v="${i}">${DIAS[i]}</button>`).join('')}</div></div>
          <small>Gin 50 ml ≈ 110 kcal; com refri zero não soma nada. O app tira um pouco de carboidrato de cada dia da semana para caber.</small>
        </div>`;
    }
    // Resumo
    const tmp = state.profile;
    state.profile = { ...d, criadoEm: d.criadoEm || dkey() };
    const segK = weekStart(dkey());
    const linhas = [0, 1, 2, 3, 4, 5, 6].map((i) => { const k = addDays(segK, i); return [k, metaDoDia(k)]; });
    state.profile = tmp;
    return `<p class="muted" style="font-size:13px">Estimativa pela fórmula de Mifflin-St Jeor × fator do tipo de dia${d.objetivo === 'perder' ? ', com déficit de 20%' : ''}. Proteína 2 g/kg, gordura mínima 0,8 g/kg, carboidrato completa.</p>
      <div class="items">${linhas.map(([k, m]) => `
        <div class="item"><div class="name"><b>${DIAS[new Date(k + 'T12:00').getDay()]}</b> · ${DAY_TYPES[m.tipo].nome}
          <small>P ${Math.round(m.p)} g · C ${Math.round(m.c)} g · G ${Math.round(m.g)} g</small></div>
          <div class="kc num">${m.kcal} kcal</div></div>`).join('')}</div>
      <div class="notice"><span><b>Importante:</b> ${DISCLAIMER}</span></div>`;
  };

  const collect = () => {
    view.querySelectorAll('input[name], textarea[name]').forEach((el) => {
      const n = el.name;
      const val = el.type === 'checkbox' ? el.checked : el.value;
      if (n.startsWith('alc-')) {
        const a = d.prefs.alcool;
        if (n === 'alc-ativo') a.ativo = val;
        if (n === 'alc-bebida') a.bebida = val;
        if (n === 'alc-doses') a.doses = Number(val) || 0;
        if (n === 'alc-kcal') a.kcalDose = Number(val) || 0;
      } else if (['ama', 'naoCome', 'restricoes', 'bebidas', 'marmita'].includes(n)) {
        d.prefs[n] = val;
      } else if (['idade', 'altura', 'peso'].includes(n)) {
        d[n] = Number(String(val).replace(',', '.')) || 0;
      } else if (['cintura', 'gordura', 'pesoMeta'].includes(n)) {
        d[n] = val === '' ? '' : Number(String(val).replace(',', '.'));
      }
    });
    view.querySelectorAll('[data-ref]').forEach((row) => {
      const r = d.refeicoes[row.dataset.ref];
      r.nome = $('[data-f=nome]', row).value.trim() || r.nome;
      r.hora = $('[data-f=hora]', row).value;
      r.marmita = $('[data-f=marmita]', row).checked;
    });
  };

  const valid = () => {
    if (step === 0 && (!(d.idade > 12 && d.idade < 100) || !(d.altura > 120 && d.altura < 230) || !(d.peso > 30 && d.peso < 300))) {
      toast('Confira idade, altura e peso.'); return false;
    }
    if (step === 3 && !d.refeicoes.length) { toast('Adicione pelo menos uma refeição.'); return false; }
    return true;
  };

  const finish = () => {
    const firstTime = !state.profile;
    d.refeicoes.sort((a, b) => a.hora.localeCompare(b.hora));
    state.profile = { ...d, criadoEm: d.criadoEm || dkey() };
    if (firstTime) {
      state.pesagens.push({ data: dkey(), peso: d.peso, ...(d.cintura ? { cintura: d.cintura } : {}), ...(d.gordura ? { gordura: d.gordura } : {}) });
    }
    save();
    toast(firstTime ? 'Tudo pronto! 💪' : 'Perfil salvo');
    if (location.hash === '#editar-perfil') history.replaceState(null, '', '#perfil');
    done();
  };

  view.onclick = (e) => {
    const t = e.target;
    const segBtn = t.closest('[data-seg] button');
    if (segBtn) {
      collect();
      const k = segBtn.parentElement.dataset.seg;
      if (k === 'orcamento') d.prefs.orcamento = segBtn.dataset.v; else d[k] = segBtn.dataset.v;
      draw(); return;
    }
    const diaChip = t.closest('[data-dia] .chip');
    if (diaChip) { d.rotina[diaChip.parentElement.dataset.dia] = diaChip.dataset.v; collect(); draw(); return; }
    const alcChip = t.closest('[data-alc-dias] .chip');
    if (alcChip) {
      collect();
      const v = Number(alcChip.dataset.v); const a = d.prefs.alcool;
      a.dias = a.dias.includes(v) ? a.dias.filter((x) => x !== v) : [...a.dias, v];
      draw(); return;
    }
    const del = t.closest('[data-del]');
    if (del) { collect(); d.refeicoes.splice(Number(del.dataset.del), 1); draw(); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (!act) return;
    collect();
    if (act === 'cancel') { history.replaceState(null, '', '#perfil'); done(); return; }
    if (act === 'add-ref') { d.refeicoes.push({ id: uid(), nome: 'Lanche', hora: '16:00', marmita: false }); draw(); return; }
    if (act === 'back') { step--; draw(); return; }
    if (act === 'next') {
      if (!valid()) return;
      if (step === STEPS.length - 1) finish(); else { step++; draw(); window.scrollTo(0, 0); }
    }
  };
  view.onchange = (e) => {
    if (e.target.name === 'alc-ativo') { collect(); draw(); }
  };

  draw();
}
