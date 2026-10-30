// Aba Perfil: dados, IA, backup e aviso.
import { state, save, exportBackup, importBackup, replaceState, emptyState } from '../store.js';
import { esc, $, toast, confirmSheet, DISCLAIMER } from '../ui.js';
import { fmt } from '../foods.js';
import { DAY_TYPES, OBJETIVOS, DIAS, metaDoDia, tmb, pesoAtual, dkey } from '../calc.js';

const MODELOS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 (melhor qualidade)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (mais barato)'],
];

export function renderPerfil(view) {
  const p = state.profile;
  const m = metaDoDia(dkey());
  const pr = p.prefs || {};
  view.innerHTML = `
    <div class="page-head"><div><div class="sub">${p.sexo === 'F' ? 'Mulher' : 'Homem'} · ${p.idade} anos · ${p.altura} cm</div><h1>Perfil</h1></div></div>

    <div class="card tight">
      <div class="card-head"><h2>Seus dados</h2><button class="btn small" data-act="editar">Editar</button></div>
      <div class="grid2">
        <div class="stat"><div class="v num">${fmt.g(pesoAtual())} kg</div><div class="k">peso (média 7 dias)</div></div>
        <div class="stat"><div class="v" style="font-size:16px">${OBJETIVOS[p.objetivo].nome}</div><div class="k">${p.pesoMeta ? `meta ${fmt.g(p.pesoMeta)} kg` : 'objetivo'}</div></div>
      </div>
      <small>Rotina: ${[1, 2, 3, 4, 5, 6, 0].map((d) => `${DIAS[d]} ${DAY_TYPES[p.rotina[d]].icon}`).join(' · ')}</small>
      <small>Refeições: ${p.refeicoes.map((r) => `${esc(r.nome)} ${esc(r.hora)}${r.marmita ? ' (marmita)' : ''}`).join(' · ')}</small>
      <small>Ama: ${esc(pr.ama || '—')} · Não come: ${esc(pr.naoCome || '—')} · Orçamento: ${esc(pr.orcamento)}</small>
    </div>

    <div class="card tight">
      <h2>Como suas metas são calculadas</h2>
      <small>TMB (Mifflin-St Jeor): <b>${fmt.k(tmb(p, pesoAtual()))} kcal</b>. Fatores por dia:
        ${Object.values(DAY_TYPES).map((t) => `${t.nome} ×${String(t.fator).replace('.', ',')}`).join(', ')}.
        Objetivo: ${OBJETIVOS[p.objetivo].nome} (×${String(OBJETIVOS[p.objetivo].mult).replace('.', ',')}).
        ${p.ajusteKcal ? `Ajuste pela tendência: ${p.ajusteKcal > 0 ? '+' : ''}${p.ajusteKcal} kcal.` : ''}
        Proteína 2 g/kg, gordura ≥ 0,8 g/kg, carboidrato completa.</small>
      <small>Hoje (${DAY_TYPES[m.tipo].nome}): <b>${fmt.k(m.kcal)} kcal</b> · P ${fmt.int(m.p)} g · C ${fmt.int(m.c)} g · G ${fmt.int(m.g)} g
        ${m.alcoolDesconto ? ` (já com −${m.alcoolDesconto} kcal/dia para a bebida do fim de semana)` : ''}</small>
    </div>

    <div class="card">
      <h2>Inteligência artificial</h2>
      <small>Usada só para gerar e trocar cardápios. Precisa de uma chave da API da Anthropic (console.anthropic.com) — é cobrada por uso, separada da assinatura do Claude. A chave fica salva só neste celular e não vai no backup.</small>
      <label class="field">Chave da API<input type="password" id="key" value="${esc(state.config.apiKey)}" placeholder="sk-ant-..." autocomplete="off"></label>
      <label class="field">Modelo<select id="model">${MODELOS.map(([v, l]) => `<option value="${v}" ${state.config.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn" data-act="salvar-ia">Salvar</button>
    </div>

    <div class="card">
      <h2>Backup</h2>
      <small>Seus dados ficam só neste aparelho. Exporte um backup de vez em quando (ex.: mande para o seu e-mail ou Drive).</small>
      <div class="row"><button class="btn grow" data-act="export">Exportar JSON</button>
        <button class="btn grow" data-act="import">Importar JSON</button></div>
      <input type="file" id="file" accept="application/json,.json" hidden>
      <small>${state.pesagens.length} pesagens · ${Object.keys(state.diario).length} dias no diário · ${state.pratos.length} pratos</small>
    </div>

    <div class="card tight">
      <h2>Instalar no celular</h2>
      <small><b>iPhone (Safari):</b> Compartilhar → "Adicionar à Tela de Início". <b>Android (Chrome):</b> menu ⋮ → "Instalar app" / "Adicionar à tela inicial".</small>
    </div>

    <button class="btn danger" data-act="reset">Apagar todos os dados</button>
    <p class="disclaimer">${DISCLAIMER}</p>`;

  view.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'editar') location.hash = 'editar-perfil';
    if (act === 'salvar-ia') {
      state.config.apiKey = $('#key', view).value.trim();
      state.config.model = $('#model', view).value;
      save(); toast('Configuração salva');
    }
    if (act === 'export') exportar();
    if (act === 'import') $('#file', view).click();
    if (act === 'reset') {
      const ok = await confirmSheet({ title: 'Apagar tudo?', text: 'Perfil, pesagens, diário, pratos e cardápio serão apagados deste aparelho. Exporte um backup antes se quiser guardar.', ok: 'Apagar tudo', danger: true });
      if (ok) { replaceState(emptyState()); location.hash = ''; document.dispatchEvent(new Event('app:refresh')); }
    }
  };
  view.onchange = async (e) => {
    if (e.target.id !== 'file') return;
    const file = e.target.files[0];
    if (!file) return;
    try {
      const ok = await confirmSheet({ title: 'Importar backup?', text: `Os dados atuais serão substituídos pelos de "${file.name}".`, ok: 'Importar' });
      if (!ok) return;
      importBackup(await file.text());
      toast('Backup importado');
      document.dispatchEvent(new Event('app:refresh'));
    } catch (err) {
      toast('Não foi possível importar: ' + err.message, 4000);
    } finally { e.target.value = ''; }
  };
}

async function exportar() {
  const json = exportBackup();
  const name = `meu-shape-backup-${dkey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  // No celular, a folha de compartilhar permite salvar em Arquivos/Drive/e-mail.
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Backup Meu Shape' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
