// Pequenos utilitários de interface.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// Folha que sobe de baixo. `render(el, close)` monta o conteúdo.
export function openSheet(render) {
  const root = $('#sheet-root');
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = '<div class="sheet" role="dialog"><div class="grab"></div><div class="sheet-body stack" style="gap:12px"></div></div>';
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  root.appendChild(back);
  render($('.sheet-body', back), close);
  return close;
}

export function confirmSheet({ title, text, ok = 'Confirmar', cancel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    openSheet((el, close) => {
      el.innerHTML = `<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
        <div class="row"><button class="btn grow" data-r="0">${esc(cancel)}</button>
        <button class="btn grow ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div>`;
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (b) { close(); resolve(b.dataset.r === '1'); }
      });
    });
  });
}

export function ring(valor, meta, { size = 132, stroke = 12 } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = meta > 0 ? Math.min(1, valor / meta) : 0;
  const over = valor > meta * 1.03;
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${over ? 'var(--danger)' : 'var(--accent)'}"
      stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}"/></svg>`;
}

export function bar(cls, nome, valor, meta, unidade = 'g') {
  const pct = meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  const over = valor > meta * 1.1;
  return `<div class="bar-row"><div class="top"><span>${nome}</span>
    <span class="num ${over ? 'over' : ''}">${Math.round(valor)} / ${Math.round(meta)} ${unidade}</span></div>
    <div class="bar ${cls}"><i style="width:${pct}%"></i></div></div>`;
}

export const icons = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>',
};

export const DISCLAIMER = 'Metas e cardápios são estimativas e não substituem o acompanhamento de um nutricionista.';
