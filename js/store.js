// Estado do app, salvo no próprio celular (localStorage).
// Tudo fica num único objeto JSON — o mesmo formato do backup.

const KEY = 'meu-shape.v1';

export function emptyState() {
  return {
    version: 1,
    profile: null,        // preenchido pelo onboarding
    pesagens: [],         // [{ data:'AAAA-MM-DD', peso, cintura?, gordura? }]
    diario: {},           // { 'AAAA-MM-DD': [registro] }
    plano: null,          // cardápio gerado pela IA (ver views/dieta.js)
    pratos: [],           // receitas do usuário
    recentes: [],         // ids de alimentos usados recentemente
    ajustes: [],          // histórico de ajustes automáticos de calorias
    config: { apiKey: '', model: 'claude-opus-5-5' },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return migrate({ ...emptyState(), ...JSON.parse(raw) });
  } catch {
    return emptyState();
  }
}

// Ajusta dados salvos por versões antigas do app.
function migrate(s) {
  const a = s.profile?.prefs?.alcool;
  if (a && !('descricao' in a)) {
    // v1 tinha campos fixos (bebida, doses, kcal por dose); agora é texto livre.
    a.descricao = [a.bebida, a.doses ? `(${a.doses} doses)` : ''].filter(Boolean).join(' ');
    delete a.bebida; delete a.doses; delete a.kcalDose;
  }
  return s;
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Falha ao salvar', e);
  }
}

// Pede ao navegador para não apagar os dados quando faltar espaço.
export function requestPersistence() {
  try { navigator.storage?.persist?.(); } catch { /* sem suporte */ }
}

export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, emptyState(), next);
  save();
}

export function exportBackup() {
  const copy = JSON.parse(JSON.stringify(state));
  copy.config.apiKey = ''; // a chave da API não vai no arquivo
  copy.exportadoEm = new Date().toISOString();
  return JSON.stringify(copy, null, 2);
}

export function importBackup(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('pesagens' in data) || !('diario' in data)) {
    throw new Error('Arquivo não parece um backup do app.');
  }
  const apiKey = state.config.apiKey;
  replaceState(migrate(data));
  if (!state.config.apiKey) state.config.apiKey = apiKey;
  save();
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
