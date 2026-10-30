// Base de alimentos: TACO + alguns itens que não existem na TACO + pratos do usuário.
// Todo alimento é descrito por 100 g; ids: "T<n>" (TACO), "X<n>" (extras), "P<id>" (prato).
import { TACO, TACO_CATS } from './taco-data.js';
import { state } from './store.js';

// Itens que faltam na TACO. Valores de rótulo típico / estimativa — por 100 g (ou 100 ml).
const EXTRAS = [
  ['X1', 'Whey protein concentrado (pó)', 400, 78, 8, 6.5, 0, [['1 scoop (30 g)', 30]]],
  ['X2', 'Gin (40% álcool)', 220, 0, 0, 0, 0, [['1 dose (50 ml)', 50], ['2 doses', 100]]],
  ['X3', 'Refrigerante zero / diet', 1, 0, 0, 0, 0, [['1 lata (350 ml)', 350], ['1 copo (250 ml)', 250]]],
  ['X4', 'Purê de batata caseiro (com leite e manteiga)', 100, 2, 14, 4, 1.2, [['1 escumadeira (90 g)', 90], ['2 escumadeiras', 180]]],
  ['X5', 'Pasta de amendoim integral', 600, 25, 20, 48, 7, [['1 col. sopa (15 g)', 15]]],
  ['X6', 'Goma de tapioca hidratada', 240, 0, 60, 0, 0.5, [['1 tapioca (60 g)', 60]]],
  ['X7', 'Iogurte proteico (tipo "high protein")', 60, 10, 4, 0.5, 0, [['1 pote (160 g)', 160]]],
  ['X8', 'Frango desfiado (peito cozido)', 163, 31.5, 0, 3.2, 0, [['3 col. sopa (75 g)', 75], ['1 porção (120 g)', 120]]],
];

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const BASE = new Map();
for (const [id, nome, cat, kcal, p, c, g, f] of TACO) {
  BASE.set('T' + id, { id: 'T' + id, nome, cat: TACO_CATS[cat], kcal, p, c, g, f, fonte: 'TACO' });
}
for (const [id, nome, kcal, p, c, g, f, porcoes] of EXTRAS) {
  BASE.set(id, { id, nome, cat: 'Extras', kcal, p, c, g, f, fonte: 'Rótulo/estimativa', porcoes });
}
for (const f of BASE.values()) f._n = norm(f.nome);

// Prato -> alimento por 100 g (a partir dos ingredientes) + peso da porção.
export function pratoAsFood(prato) {
  let peso = 0, kcal = 0, p = 0, c = 0, g = 0, fib = 0;
  for (const ing of prato.ingredientes) {
    const f = BASE.get(ing.foodId);
    if (!f) continue;
    const k = ing.gramas / 100;
    peso += ing.gramas; kcal += f.kcal * k; p += f.p * k; c += f.c * k; g += f.g * k; fib += f.f * k;
  }
  const pesoTotal = prato.pesoFinal > 0 ? prato.pesoFinal : peso;
  const porcoes = Math.max(1, prato.porcoes || 1);
  const porcaoG = pesoTotal / porcoes;
  const per100 = pesoTotal > 0 ? 100 / pesoTotal : 0;
  return {
    id: 'P' + prato.id, nome: prato.nome, cat: 'Meus pratos', fonte: 'Prato',
    kcal: kcal * per100, p: p * per100, c: c * per100, g: g * per100, f: fib * per100,
    porcaoG, porcoes: [['1 porção', porcaoG], ['½ porção', porcaoG / 2], ['2 porções', porcaoG * 2]],
    _n: norm(prato.nome),
    totais: { kcal, p, c, g, peso: pesoTotal },
  };
}

export function getFood(id) {
  if (!id) return null;
  if (id[0] === 'P') {
    const prato = state.pratos.find((x) => 'P' + x.id === id);
    return prato ? pratoAsFood(prato) : null;
  }
  return BASE.get(id) || null;
}

export function allFoods() {
  return [...state.pratos.map(pratoAsFood), ...BASE.values()];
}

export function macrosFor(food, gramas) {
  const k = gramas / 100;
  return { kcal: food.kcal * k, p: food.p * k, c: food.c * k, g: food.g * k };
}

export function sumMacros(list) {
  return list.reduce((a, x) => ({ kcal: a.kcal + (x.kcal || 0), p: a.p + (x.p || 0), c: a.c + (x.c || 0), g: a.g + (x.g || 0) }),
    { kcal: 0, p: 0, c: 0, g: 0 });
}

// Busca sem acento, todas as palavras precisam aparecer. Pratos e recentes primeiro.
export function searchFoods(q, limit = 40) {
  const tokens = norm(q).split(/[\s,]+/).filter(Boolean);
  const recent = state.recentes;
  const foods = allFoods();
  if (!tokens.length) {
    const rec = recent.map(getFood).filter(Boolean);
    const pratos = foods.filter((f) => f.id[0] === 'P' && !recent.includes(f.id));
    return [...rec, ...pratos].slice(0, limit);
  }
  const scored = [];
  for (const f of foods) {
    if (!tokens.every((t) => f._n.includes(t))) continue;
    let s = f._n.length / 10;
    if (f._n.startsWith(tokens[0])) s -= 20;
    if (f.id[0] === 'P') s -= 30;
    const r = recent.indexOf(f.id);
    if (r >= 0) s -= 40 - r;
    if (/\bcru[ao]?s?\b/.test(f._n) && !tokens.some((t) => t.startsWith('cru'))) s += 6; // prefira o pronto
    scored.push([s, f]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, limit).map((x) => x[1]);
}

export function touchRecent(id) {
  state.recentes = [id, ...state.recentes.filter((x) => x !== id)].slice(0, 30);
}

// Porções rápidas (medidas caseiras aproximadas) para registrar em 1 toque.
const MEDIDAS = [
  [/^arroz.*cozido/, [['3 col. sopa (75 g)', 75], ['4 col. sopa (100 g)', 100], ['6 col. sopa (150 g)', 150]]],
  [/^feijao.*cozido/, [['1 concha (85 g)', 85], ['2 conchas (170 g)', 170]]],
  [/^macarrao.*cozido/, [['1 pegador (110 g)', 110], ['2 pegadores', 220]]],
  [/^ovo.*(cozido|frito|mexido)/, [['1 ovo (50 g)', 50], ['2 ovos', 100], ['3 ovos', 150]]],
  [/^pao, trigo, frances/, [['1 pão (50 g)', 50], ['2 pães', 100]]],
  [/^pao.*forma/, [['1 fatia (25 g)', 25], ['2 fatias', 50]]],
  [/^banana/, [['1 média (80 g)', 80], ['2 médias', 160]]],
  [/^maca/, [['1 média (130 g)', 130]]],
  [/^leite, de vaca/, [['1 copo (200 ml)', 200], ['½ copo', 100]]],
  [/^(frango|carne|peixe|porco|bovina)/, [['1 filé/bife (100 g)', 100], ['1 porção (120 g)', 120], ['150 g', 150]]],
  [/^aveia/, [['1 col. sopa (15 g)', 15], ['2 col. sopa', 30]]],
  [/^(azeite|oleo)/, [['1 col. chá (4 g)', 4], ['1 col. sopa (8 g)', 8]]],
  [/^queijo/, [['1 fatia (20 g)', 20], ['2 fatias', 40]]],
  [/^batata.*cozida|^mandioca.*cozida|^batata, doce/, [['1 média (100 g)', 100], ['150 g', 150]]],
  [/^acucar/, [['1 col. chá (5 g)', 5]]],
];

export function quickPortions(food) {
  if (food.porcoes) return food.porcoes;
  for (const [re, list] of MEDIDAS) if (re.test(food._n)) return list;
  return [['50 g', 50], ['100 g', 100], ['150 g', 150], ['200 g', 200]];
}

// Fator aproximado peso pronto -> peso cru, para a lista de compras.
export function rawFactor(food) {
  const n = food._n;
  if (/arroz.*cozido/.test(n)) return 1 / 2.6;
  if (/(feijao|lentilha|grao-de-bico|ervilha).*cozid/.test(n)) return 1 / 2.4;
  if (/macarrao.*cozido/.test(n)) return 1 / 2.3;
  if (/(frango|carne|bovina|porco|peixe|file|pescad|merluza|tilapia).*(cozid|grelhad|assad|refogad|frit)/.test(n)) return 1.35;
  if (/frango desfiado/.test(n)) return 1.35;
  return 1;
}

export const fmt = {
  k: (v) => Math.round(v).toLocaleString('pt-BR'),
  g: (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR'),
  int: (v) => Math.round(v).toLocaleString('pt-BR'),
};
