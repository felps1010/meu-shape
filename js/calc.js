// Cálculos: metas do dia, tendência de peso, ajuste automático e escala das porções.
import { state } from './store.js';
import { getFood, macrosFor } from './foods.js';

// ---------- datas (sempre no fuso local, formato AAAA-MM-DD) ----------
export const dkey = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
export const dow = (k) => parseKey(k).getDay(); // 0 = domingo
export const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const weekStart = (k) => addDays(k, -((dow(k) + 6) % 7)); // semana começa na segunda

// ---------- tipos de dia ----------
// Fator multiplicado pela TMB. Inclui o dia a dia de estudante/escritório + o treino.
export const DAY_TYPES = {
  descanso: { nome: 'Descanso', fator: 1.35, icon: '😴' },
  musculacao: { nome: 'Musculação', fator: 1.55, icon: '🏋️' },
  corrida: { nome: 'Corrida', fator: 1.6, icon: '🏃' },
  futebol: { nome: 'Futebol', fator: 1.7, icon: '⚽' },
};
export const OBJETIVOS = {
  perder: { nome: 'Perder gordura', mult: 0.8 },   // déficit padrão de 20%
  manter: { nome: 'Manter', mult: 1.0 },
  ganhar: { nome: 'Ganhar massa', mult: 1.1 },
};

// Mifflin-St Jeor
export function tmb(p, peso) {
  const base = 10 * peso + 6.25 * p.altura - 5 * p.idade;
  return p.sexo === 'F' ? base - 161 : base + 5;
}

// ---------- peso ----------
export function pesagensOrdenadas() {
  return [...state.pesagens].sort((a, b) => a.data.localeCompare(b.data));
}

// Média dos registros dos últimos 7 dias até cada data.
export function movingAverage(list = pesagensOrdenadas()) {
  return list.map((x) => {
    const win = list.filter((y) => y.data <= x.data && daysBetween(y.data, x.data) < 7);
    return { ...x, media: win.reduce((s, y) => s + y.peso, 0) / win.length };
  });
}

export function pesoAtual() {
  const ma = movingAverage();
  if (ma.length) return ma[ma.length - 1].media;
  return state.profile?.peso || 70;
}

// Ritmo (kg/semana) por regressão linear dos registros na janela. Negativo = perdendo.
export function ritmo(janela = 14, ate = dkey()) {
  const pts = pesagensOrdenadas().filter((x) => x.data <= ate && daysBetween(x.data, ate) < janela);
  if (pts.length < 4) return null;
  const span = daysBetween(pts[0].data, pts[pts.length - 1].data);
  if (span < 7) return null;
  const xs = pts.map((p) => daysBetween(pts[0].data, p.data));
  const ys = pts.map((p) => p.peso);
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return { kgSemana: (num / den) * 7, pontos: pts.length, dias: span };
}

export function projecao() {
  const p = state.profile;
  const r = ritmo(14);
  if (!p?.pesoMeta || !r) return null;
  const falta = p.pesoMeta - pesoAtual();
  if (Math.abs(falta) < 0.3) return { atingida: true };
  if (Math.sign(falta) !== Math.sign(r.kgSemana) || Math.abs(r.kgSemana) < 0.05) return { semRumo: true, falta };
  const semanas = falta / r.kgSemana;
  const data = addDays(dkey(), Math.round(semanas * 7));
  return { semanas, data, falta };
}

// ---------- metas ----------
export function tipoDoDia(k) {
  return state.profile?.rotina?.[dow(k)] || 'descanso';
}

export function alcoolSemanal() {
  const a = state.profile?.prefs?.alcool;
  if (!a?.ativo || !a.dias?.length) return { total: 0, porDia: 0, doses: 0 };
  const kcalDia = a.doses * a.kcalDose;
  const total = kcalDia * a.dias.length;
  return { total, porDia: total / 7, kcalDia, doses: a.doses };
}

// Meta do dia. `kcal` é o total para comida; o álcool do fim de semana é
// "pago" tirando um pouco de carboidrato de todos os dias (saldo semanal igual).
export function metaDoDia(k = dkey()) {
  const p = state.profile;
  const tipo = tipoDoDia(k);
  const peso = pesoAtual();
  const gasto = tmb(p, peso) * DAY_TYPES[tipo].fator;
  const kcalTotal = Math.round(gasto * OBJETIVOS[p.objetivo].mult + (p.ajusteKcal || 0));
  const alc = alcoolSemanal();
  const alcoolHoje = p.prefs?.alcool?.ativo && p.prefs.alcool.dias.includes(dow(k)) ? alc.kcalDia : 0;
  const kcal = Math.round(kcalTotal - alc.porDia);
  const prot = 2 * peso;
  const gord = Math.max(0.8 * peso, (0.25 * kcal) / 9);
  const carb = Math.max(0, (kcal - prot * 4 - gord * 9) / 4);
  return { tipo, gasto: Math.round(gasto), kcalTotal, kcal, p: prot, g: gord, c: carb, alcoolHoje, alcoolDesconto: Math.round(alc.porDia) };
}

// Peso relativo de cada refeição nas calorias do dia.
export function slotWeights(refeicoes = state.profile.refeicoes) {
  const w = refeicoes.map((r) => {
    const n = r.nome.toLowerCase();
    if (/almo|jant/.test(n)) return 3;
    if (/caf|desjejum/.test(n)) return 2.4;
    if (/ceia/.test(n)) return 1.2;
    return 1.6; // lanches
  });
  const s = w.reduce((a, b) => a + b, 0);
  return Object.fromEntries(refeicoes.map((r, i) => [r.id, w[i] / s]));
}

export function slotTarget(k, slotId) {
  return metaDoDia(k).kcal * (slotWeights()[slotId] || 0);
}

// ---------- ajuste automático (a cada 14 dias) ----------
export function verificarAjuste(hoje = dkey()) {
  const p = state.profile;
  if (!p) return null;
  const base = p.ultimaRevisao || p.criadoEm;
  if (daysBetween(base, hoje) < 14) return null;
  const r = ritmo(14, hoje);
  if (!r || r.dias < 10) return null;
  const v = r.kgSemana; // negativo = perdendo
  const perda = -v;
  const txt = (x) => `${Math.abs(x).toFixed(2).replace('.', ',')} kg/semana`;
  let delta = 0, motivo = '';
  if (p.objetivo === 'perder') {
    if (perda < 0.3) { delta = -150; motivo = `Nos últimos 14 dias você ${perda > 0 ? 'perdeu só ' + txt(perda) : 'não perdeu peso (' + (v > 0 ? '+' : '') + txt(v) + ')'}, abaixo do mínimo de 0,3 kg/semana.`; }
    else if (perda > 1) { delta = 150; motivo = `Você está perdendo ${txt(perda)}, acima de 1 kg/semana — rápido demais, aumenta o risco de perder músculo.`; }
  } else if (p.objetivo === 'ganhar') {
    if (v < 0.1) { delta = 150; motivo = `Você ganhou ${txt(v)} nas últimas 2 semanas, abaixo de 0,1 kg/semana.`; }
    else if (v > 0.5) { delta = -150; motivo = `Você está ganhando ${txt(v)}, acima de 0,5 kg/semana — tende a vir mais gordura.`; }
  } else if (Math.abs(v) > 0.3) {
    delta = v > 0 ? -150 : 150;
    motivo = `Seu peso variou ${v > 0 ? '+' : '−'}${txt(v)} e o objetivo é manter.`;
  }
  return { delta, motivo, ritmo: v, pontos: r.pontos };
}

export function aplicarRevisao(res, aceito) {
  const p = state.profile;
  const hoje = dkey();
  if (aceito && res.delta) p.ajusteKcal = (p.ajusteKcal || 0) + res.delta;
  p.ultimaRevisao = hoje;
  state.ajustes.push({ data: hoje, delta: res.delta, motivo: res.motivo || 'Ritmo dentro da faixa — sem mudança.', ritmo: res.ritmo, aceito });
}

// ---------- escala de porções ----------
// A IA define alimentos e porções; aqui o app recalcula tudo pela base
// e ajusta só as fontes de carboidrato para bater a meta da refeição.
export function avaliarOpcao(opcao) {
  const itens = opcao.itens.map((it) => {
    const f = getFood(it.food_id);
    return f ? { ...it, food: f, ...macrosFor(f, it.gramas) } : null;
  }).filter(Boolean);
  const tot = itens.reduce((a, x) => ({ kcal: a.kcal + x.kcal, p: a.p + x.p, c: a.c + x.c, g: a.g + x.g }), { kcal: 0, p: 0, c: 0, g: 0 });
  return { ...opcao, itens, tot };
}

export function escalarOpcao(opcao, alvoKcal) {
  const av = avaliarOpcao(opcao);
  if (!alvoKcal || !av.itens.length) return av;
  let ajust = av.itens.filter((x) => x.papel === 'carboidrato');
  if (!ajust.length) ajust = av.itens.filter((x) => x.papel !== 'proteina');
  if (!ajust.length) ajust = av.itens;
  const kAj = ajust.reduce((s, x) => s + x.kcal, 0);
  const kFixo = av.tot.kcal - kAj;
  if (kAj <= 0) return av;
  const fator = Math.min(2.5, Math.max(0.35, (alvoKcal - kFixo) / kAj));
  const novo = {
    ...opcao,
    itens: opcao.itens.map((it) => {
      const isAj = ajust.some((a) => a.food_id === it.food_id && a.gramas === it.gramas);
      if (!isAj || Math.abs(fator - 1) < 0.04) return it;
      const g = Math.max(5, Math.round((it.gramas * fator) / 5) * 5);
      return { ...it, gramas: g, medida: `ajustado de ${it.gramas} g` + (it.medida ? ` (${it.medida})` : '') };
    }),
  };
  return avaliarOpcao(novo);
}

export const r1 = (v) => Math.round(v * 10) / 10;
