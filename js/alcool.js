// Bebida alcoólica descrita em texto livre ("às vezes um gin com refri", "3 latas no churrasco").
// O app faz uma estimativa rápida e transparente; ao gerar o cardápio, o Claude reavalia
// como um nutricionista e a estimativa dele passa a valer.

// kcal por unidade típica de cada bebida (álcool + açúcar da própria bebida).
const BEBIDAS = [
  { re: /cervejas?|brejas?|chopps?|long ?necks?|latinhas?/, nome: 'Cerveja', unid: { lata: 150, 'long neck': 150, garrafa: 255, copo: 130, chopp: 130, tulipa: 130 }, padrao: ['lata', 2] },
  { re: /vinho/, nome: 'Vinho', unid: { 'taça': 125, copo: 125, garrafa: 625 }, padrao: ['taça', 2] },
  { re: /espumante|champanhe|prosecco/, nome: 'Espumante', unid: { 'taça': 100, garrafa: 560 }, padrao: ['taça', 2] },
  { re: /caipirinha|caipiroska|caipi/, nome: 'Caipirinha', unid: { copo: 250, dose: 250 }, padrao: ['copo', 2] },
  { re: /\bgins?\b/, nome: 'Gin', unid: { dose: 110, copo: 110, 'taça': 110, lata: 160 }, padrao: ['dose', 2], destilado: true },
  { re: /vodka|vodca/, nome: 'Vodka', unid: { dose: 110, copo: 110, lata: 160 }, padrao: ['dose', 2], destilado: true },
  { re: /whisk/, nome: 'Whisky', unid: { dose: 115, copo: 115 }, padrao: ['dose', 2], destilado: true },
  { re: /\brum\b/, nome: 'Rum', unid: { dose: 110, copo: 110 }, padrao: ['dose', 2], destilado: true },
  { re: /tequila/, nome: 'Tequila', unid: { dose: 110, shot: 70 }, padrao: ['dose', 2], destilado: true },
  { re: /cacha[cç]a|pinga/, nome: 'Cachaça', unid: { dose: 115, copo: 115 }, padrao: ['dose', 2], destilado: true },
  { re: /drink|coquetel|batida|ice\b|skol beats|beats/, nome: 'Drink', unid: { copo: 200, lata: 200, garrafa: 200 }, padrao: ['copo', 2] },
];

const UNIDADES = { lata: /latas?|latinhas?/, 'long neck': /long ?necks?/, garrafa: /garrafas?|litr[aã]o/, 'taça': /ta[cç]as?/, copo: /copos?|copão/, dose: /doses?/, shot: /shots?/, chopp: /chopps?/, tulipa: /tulipas?/ };
const NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, meia: 0.5, meio: 0.5 };
const MISTURA = /refri|refrigerante|t[oô]nica|energ[eé]tico|suco|xarope/;
const SEM_ACUCAR = /zero|diet|light|sem a[cç][uú]car|com [aá]gua|soda|gelo/;

const norm = (s) => s.toLowerCase();

// Quantidade: número (que não seja "1x", "350 ml", "40%"…) ou número por extenso.
const QTD_NUM = /(\d+(?:[.,]\d+)?)(?!\s*(?:x|ml|l\b|%|h\b|[.,]?\d))/g;
const QTD_TXT = /(?:^|[^a-zà-ú])(uma?|dois|duas|tr[eê]s|quatro|cinco|seis|meia|meio)(?![a-zà-ú])/g;

// Prefere o número mais perto da bebida: o último antes dela, senão o primeiro depois.
function quantidade(antes, depois) {
  for (const re of [QTD_NUM, QTD_TXT]) {
    const a = [...antes.matchAll(re)].at(-1);
    if (a) return a[1];
    const d = [...depois.matchAll(re)][0];
    if (d) return d[1];
  }
  return null;
}

// Acha cada bebida citada e lê quantidade/unidade/misturador no pedaço de texto ao redor dela.
export function estimarAlcool(a) {
  const vazio = { ativo: false, kcalSemana: 0, porOcasiao: 0, ocasioes: 0, itens: [], obs: [] };
  if (!a?.ativo) return vazio;
  const txt = norm(a.descricao || '');
  const itens = [];
  const obs = [];
  const mencoes = [];
  for (const b of BEBIDAS) {
    const re = new RegExp(b.re.source, 'g');
    for (const m of txt.matchAll(re)) {
      if (!mencoes.some((x) => m.index < x.fim && m.index + m[0].length > x.ini)) mencoes.push({ b, ini: m.index, fim: m.index + m[0].length });
    }
  }
  mencoes.sort((x, y) => x.ini - y.ini);
  // "cerveja … umas duas long necks" é uma bebida só.
  for (let i = mencoes.length - 1; i > 0; i--) {
    if (mencoes[i].b === mencoes[i - 1].b) { mencoes[i - 1].fim = mencoes[i].fim; mencoes.splice(i, 1); }
  }
  mencoes.forEach((men, i) => {
    const antes = txt.slice(i ? mencoes[i - 1].fim : 0, men.fim);
    const depois = txt.slice(men.ini, i < mencoes.length - 1 ? mencoes[i + 1].ini : txt.length);
    const b = men.b;
    const unidEm = (s) => Object.entries(UNIDADES).find(([u, re]) => re.test(s) && b.unid[u])?.[0];
    const unid = unidEm(antes) || unidEm(depois) || b.padrao[0];
    const q = quantidade(antes, depois.slice(men.fim - men.ini));
    const n = q && (/\d/.test(q) ? Number(q.replace(',', '.')) : NUMEROS[q]);
    const qtd = n > 0 ? n : b.padrao[1];
    let kcal = qtd * b.unid[unid];
    let mistura = '';
    const ctx = antes + depois;
    if (b.destilado && MISTURA.test(ctx) && !SEM_ACUCAR.test(ctx)) {
      kcal += qtd * 70; // ~180 ml de refri/tônica comum por drink
      mistura = ' + misturador com açúcar';
    }
    itens.push({ nome: b.nome, qtd, unid, kcal, texto: `${fmtQtd(qtd)} ${plural(unid, qtd)} de ${b.nome.toLowerCase()}${mistura}` });
    if (!(n > 0)) obs.push(`Quantidade de ${b.nome.toLowerCase()} não informada — considerei ${b.padrao[1]} ${plural(b.padrao[0], 2)}.`);
  });
  if (!itens.length && txt.trim()) {
    itens.push({ nome: 'Bebida', qtd: 1, unid: 'ocasião', kcal: 250, texto: 'bebida não identificada (~250 kcal)' });
    obs.push('Não reconheci a bebida — usei 250 kcal por ocasião. Descreva o que e quanto para melhorar.');
  }
  // Frequência: cada dia marcado é uma ocasião; "às vezes" conta como metade das semanas.
  // Se o texto já cita os dias ("sábado…, domingo…"), ele descreve a semana inteira.
  const dias = a.dias?.length || 1;
  const eventual = /[aà]s vezes|de vez em quando|raramente|eventual|uma vez ou outra|quinzena|por m[eê]s/.test(txt);
  const mensal = /por m[eê]s/.test(txt);
  const fator = mensal ? 0.25 : eventual ? 0.5 : 1;
  const semanal = /s[aá]bado|domingo|sexta|segunda|ter[cç]a|quarta|quinta/.test(txt);
  if (eventual) obs.push(mensal ? 'Mensal: entra como 1/4 por semana na reserva.' : '"Às vezes" entra como metade das semanas — a reserva é a média.');
  if (semanal && dias > 1) obs.push('Como você citou os dias no texto, considerei a descrição como a semana toda.');
  const total = itens.reduce((s, i) => s + i.kcal, 0);
  let porOcasiao = semanal ? total / dias : total;
  if (a.kcalOcasiao > 0) { porOcasiao = a.kcalOcasiao; obs.unshift('Usando o valor por ocasião que você informou.'); }
  const ocasioes = dias * fator;
  return { ativo: true, kcalSemana: Math.round(porOcasiao * ocasioes), porOcasiao: Math.round(porOcasiao), ocasioes, itens, obs };
}

function plural(u, q) {
  if (q <= 1) return u;
  if (u === 'long neck') return 'long necks';
  return { 'taça': 'taças', copo: 'copos', lata: 'latas', garrafa: 'garrafas', dose: 'doses', shot: 'shots', chopp: 'chopps', tulipa: 'tulipas' }[u] || u;
}
const fmtQtd = (q) => String(q).replace('.', ',');

export const ehAlcool = (nome) => /\bgin\b|cerveja|vinho|cacha[cç]a|vodka|whisk|caipirinha|chopp|espumante|tequila|\brum\b/i.test(nome);
