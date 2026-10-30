// Integração com o Claude (API da Anthropic), chamada direto do celular.
// A IA só escolhe alimentos (por id da base) e porções; o app recalcula os macros.
import { state } from './store.js';
import { TACO } from './taco-data.js';
import { allFoods } from './foods.js';
import { metaDoDia, slotWeights, DAY_TYPES, DIAS_LONGOS, OBJETIVOS, alcoolSemanal, dkey, addDays, weekStart, pesoAtual } from './calc.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.134.0/+esm';
let clientPromise;

async function client() {
  const key = state.config.apiKey?.trim();
  if (!key) throw new Error('Configure sua chave da API do Claude em Perfil → Inteligência artificial.');
  if (!clientPromise || clientPromise.key !== key) {
    clientPromise = import(SDK_URL).then(({ default: Anthropic }) => new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true }));
    clientPromise.key = key;
  }
  return clientPromise;
}

// ---------- schemas (saída estruturada) ----------
const ITEM = {
  type: 'object', additionalProperties: false,
  required: ['food_id', 'gramas', 'medida', 'papel'],
  properties: {
    food_id: { type: 'string', description: 'id exato do catálogo, ex.: T3, X2, P1' },
    gramas: { type: 'number', description: 'peso do alimento pronto para comer, em gramas (ou ml)' },
    medida: { type: 'string', description: 'medida caseira equivalente, ex.: "4 col. sopa", "1 concha média"' },
    papel: { type: 'string', enum: ['proteina', 'carboidrato', 'gordura', 'vegetal', 'fruta', 'bebida', 'outro'] },
  },
};
const OPCAO = {
  type: 'object', additionalProperties: false,
  required: ['nome', 'itens', 'preparo'],
  properties: {
    nome: { type: 'string', description: 'nome curto e apetitoso da refeição' },
    itens: { type: 'array', items: ITEM },
    preparo: { type: 'string', description: 'dica de preparo em 1 frase' },
  },
};
const PLANO = {
  type: 'object', additionalProperties: false,
  required: ['refeicoes', 'alcool', 'preparo_marmitas', 'dicas'],
  properties: {
    refeicoes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['slot_id', 'opcoes'],
        properties: { slot_id: { type: 'string' }, opcoes: { type: 'array', items: OPCAO } },
      },
    },
    alcool: {
      type: 'object', additionalProperties: false,
      required: ['leitura', 'kcal_semana', 'recomendacoes'],
      properties: {
        leitura: { type: 'string', description: 'como você entendeu o hábito: o quê, quanto, com que frequência' },
        kcal_semana: { type: 'number', description: 'estimativa realista da média semanal em kcal (álcool + misturadores); 0 se não bebe' },
        recomendacoes: { type: 'array', items: { type: 'string' } },
      },
    },
    preparo_marmitas: { type: 'array', items: { type: 'string' }, description: 'roteiro de preparo das marmitas da semana, passo a passo' },
    dicas: { type: 'array', items: { type: 'string' } },
  },
};
const TROCA = { type: 'object', additionalProperties: false, required: ['opcao'], properties: { opcao: OPCAO } };

// ---------- prompts ----------
function catalogo() {
  const linhas = ['id|alimento|kcal|prot|carb|gord (por 100 g)'];
  for (const f of allFoods()) {
    if (f.id[0] === 'T' || f.id[0] === 'X' || f.id[0] === 'P') {
      linhas.push(`${f.id}|${f.nome}|${Math.round(f.kcal)}|${f.p.toFixed(1)}|${f.c.toFixed(1)}|${f.g.toFixed(1)}`);
    }
  }
  return linhas.join('\n');
}

function systemPrompt() {
  return [
    {
      type: 'text',
      text: `Você é um nutricionista esportivo brasileiro montando cardápios práticos para um app pessoal de dieta.

Regras:
- Use SOMENTE alimentos do catálogo abaixo, referenciados pelo id exato (coluna id). Ids P... são pratos que o próprio usuário cadastrou — use-os quando combinarem.
- "gramas" é o peso do alimento pronto para comer (arroz cozido, frango grelhado etc.). Prefira itens do catálogo já cozidos/prontos.
- Toda refeição principal precisa de uma fonte de proteína. Distribua a proteína do dia entre as refeições.
- Cada item recebe um "papel". O app ajusta automaticamente as porções dos itens com papel "carboidrato" para bater as calorias de cada dia, então mantenha arroz, batata, pão, macarrão, frutas de base etc. como "carboidrato".
- Comida de verdade, brasileira, barata quando o orçamento for baixo, fácil de transportar quando for marmita. Respeite o que a pessoa ama e o que ela não come.
- As opções de uma mesma refeição devem ser equivalentes em calorias e proteína, mas variadas entre si.
- Escreva em português do Brasil, direto e curto.

Catálogo de alimentos:
${catalogo()}`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

function perfilTexto() {
  const p = state.profile;
  const pr = p.prefs || {};
  const hoje = dkey();
  const seg = weekStart(hoje);
  const rotina = [1, 2, 3, 4, 5, 6, 0].map((d) => `${DIAS_LONGOS[d]}: ${DAY_TYPES[p.rotina[d]].nome}`).join('; ');
  const metas = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const k = addDays(seg, i);
    const m = metaDoDia(k);
    return `${DIAS_LONGOS[(i + 1) % 7]} (${DAY_TYPES[m.tipo].nome}): ${m.kcal} kcal, P ${Math.round(m.p)} g, C ${Math.round(m.c)} g, G ${Math.round(m.g)} g`;
  }).join('\n');
  return `Pessoa: ${p.sexo === 'F' ? 'mulher' : 'homem'}, ${p.idade} anos, ${p.altura} cm, ${pesoAtual().toFixed(1)} kg (média recente). Objetivo: ${OBJETIVOS[p.objetivo].nome}.
Rotina: ${rotina}.
Ama comer: ${pr.ama || '—'}
Não come / não gosta: ${pr.naoCome || '—'}
Restrições: ${pr.restricoes || 'nenhuma'}
Orçamento: ${pr.orcamento || 'médio'}. Leva marmita: ${pr.marmita ? 'sim' : 'não'}.
Bebidas do dia a dia: ${pr.bebidas || '—'}
${alcoolTexto()}

Metas de comida desta semana (já descontada a reserva para bebida alcoólica):
${metas}`;
}

function alcoolTexto() {
  const a = state.profile.prefs?.alcool;
  if (!a?.ativo) return 'Bebida alcoólica: não costuma beber.';
  const alc = alcoolSemanal();
  const e = alc.est;
  const dias = a.dias?.length ? a.dias.map((d) => DIAS_LONGOS[d]).join(', ') : 'varia';
  return `Bebida alcoólica, nas palavras da pessoa: "${a.descricao || '(sem descrição)'}". Dias mais comuns: ${dias}.
Estimativa automática do app (heurística simples): ${e.itens.map((i) => i.texto).join(' + ') || '—'} → ~${e.porOcasiao} kcal por ocasião, ~${e.kcalSemana} kcal/semana.${a.kcalOcasiao > 0 ? ` A pessoa informou ${a.kcalOcasiao} kcal por ocasião — respeite esse valor.` : ''}
Hoje o app reserva ~${Math.round(alc.porDia)} kcal/dia (tirados do carboidrato) para isso.`;
}

function refeicoesTexto() {
  const w = slotWeights();
  const ref = referencia();
  return state.profile.refeicoes.map((r) =>
    `- slot_id "${r.id}": ${r.nome} às ${r.hora}${r.marmita ? ' (MARMITA, vai ser transportada)' : ''} — alvo ≈ ${Math.round(ref.kcal * w[r.id])} kcal, ≈ ${Math.round(ref.p * w[r.id])} g de proteína`,
  ).join('\n');
}

// Dia "médio" da semana: base para as opções (o app escala por dia).
function referencia() {
  const seg = weekStart(dkey());
  const ms = [0, 1, 2, 3, 4, 5, 6].map((i) => metaDoDia(addDays(seg, i)));
  return { kcal: ms.reduce((s, m) => s + m.kcal, 0) / 7, p: ms.reduce((s, m) => s + m.p, 0) / 7 };
}

// ---------- chamadas ----------
async function chamar(userText, schema) {
  const c = await client();
  let msg;
  try {
    const stream = c.beta.messages.stream({
      model: state.config.model || 'claude-opus-5-5',
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system: systemPrompt(),
      messages: [{ role: 'user', content: userText }],
    });
    msg = await stream.finalMessage();
  } catch (e) {
    const st = e?.status;
    if (st === 401) throw new Error('Chave da API inválida. Confira em Perfil.');
    if (st === 429) throw new Error('Limite de uso da API atingido. Tente de novo em alguns minutos.');
    if (st === 400 && /credit|balance/i.test(e.message)) throw new Error('Sem créditos na conta da API da Anthropic.');
    if (!navigator.onLine) throw new Error('Sem internet. Gerar cardápio precisa de conexão.');
    throw new Error('Erro ao falar com o Claude: ' + (e?.message || e));
  }
  if (msg.stop_reason === 'refusal') throw new Error('O Claude recusou o pedido. Tente ajustar as preferências.');
  if (msg.stop_reason === 'max_tokens') throw new Error('A resposta veio cortada. Tente de novo.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

// Confere ids e porções devolvidos pela IA; descarta o que não existe na base.
function limparOpcao(op, problemas) {
  const ids = new Set(allFoods().map((f) => f.id));
  const itens = op.itens.filter((it) => {
    const ok = ids.has(it.food_id) && it.gramas > 0 && it.gramas < 1500;
    if (!ok) problemas.push(`${op.nome}: item ${it.food_id} ignorado`);
    return ok;
  }).map((it) => ({ ...it, gramas: Math.round(it.gramas) }));
  return { ...op, itens };
}

export async function gerarCardapio(extra = '') {
  const pedido = `${perfilTexto()}

Refeições do dia (crie 3 opções intercambiáveis para cada uma, com quantidades para um dia de referência):
${refeicoesTexto()}

Também:
- alcool: aqui você é um nutricionista que recomenda, sem julgar nem proibir. Leia a descrição da pessoa (pode ser vaga: "às vezes", "uma lata", "uns drinks"), diga em 1–2 frases como entendeu (o quê, quanto, frequência), dê sua estimativa realista da média semanal em kcal (o app usa esse número para a reserva; 0 se não bebe) e 3–5 recomendações práticas e personalizadas para encaixar no plano sem perder o resultado (escolhas e misturadores, comer antes, hidratação, dia seguinte, quando reduzir). Se não bebe, leitura vazia e lista vazia.
- preparo_marmitas: roteiro curto para preparar as marmitas da semana de uma vez (ordem das tarefas, quantidades aproximadas, como armazenar).
- dicas: 3 a 5 dicas curtas e específicas para esta pessoa.
${extra ? '\nPedido extra do usuário: ' + extra : ''}`;
  const res = await chamar(pedido, PLANO);
  const problemas = [];
  const slots = {};
  for (const r of res.refeicoes) {
    if (!state.profile.refeicoes.some((x) => x.id === r.slot_id)) continue;
    slots[r.slot_id] = r.opcoes.map((o) => limparOpcao(o, problemas)).filter((o) => o.itens.length);
  }
  if (TACO.length && !Object.keys(slots).length) throw new Error('A IA não devolveu refeições válidas. Tente de novo.');
  const a = state.profile.prefs?.alcool;
  const kcalIa = Number(res.alcool?.kcal_semana);
  return {
    criadoEm: new Date().toISOString(),
    slots,
    // Guardada junto com a descrição: se a pessoa mudar o texto, volta a valer a estimativa local.
    alcool: a?.ativo && res.alcool ? {
      descricao: a.descricao,
      kcalSemana: Number.isFinite(kcalIa) ? Math.round(Math.min(5000, Math.max(0, kcalIa))) : alcoolSemanal().est.kcalSemana,
      leitura: res.alcool.leitura,
      recomendacoes: res.alcool.recomendacoes || [],
    } : null,
    preparo: res.preparo_marmitas,
    dicas: res.dicas,
    escolhas: {},
    problemas,
  };
}

export async function trocarRefeicao(slot, opcaoAtual, alvoKcal, pedido = '') {
  const atual = opcaoAtual.itens.map((it) => `${it.food_id} ${it.gramas} g`).join(', ');
  const texto = `${perfilTexto()}

Crie UMA nova opção para a refeição "${slot.nome}" (${slot.hora}${slot.marmita ? ', marmita' : ''}), equivalente em calorias (~${Math.round(alvoKcal)} kcal) e proteína, diferente da atual.
Opção atual: ${opcaoAtual.nome} — ${atual}.
${pedido ? 'Pedido do usuário: ' + pedido : ''}`;
  const res = await chamar(texto, TROCA);
  const op = limparOpcao(res.opcao, []);
  if (!op.itens.length) throw new Error('A IA não devolveu itens válidos. Tente de novo.');
  return op;
}
