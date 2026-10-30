# Meu Shape — dieta e evolução física (PWA)

App pessoal, mobile-first, sem login e sem backend. HTML + CSS + JavaScript puro (módulos ES), sem etapa de build.
Os dados ficam no `localStorage` do celular; use **Perfil → Exportar JSON** para backup.

## Estrutura

| Arquivo | O que faz |
|---|---|
| `index.html`, `manifest.webmanifest`, `sw.js` | Casca do PWA (instalável, abre offline) |
| `js/store.js` | Estado do app, salvar/carregar, backup |
| `js/taco-data.js` | Base TACO (597 alimentos, por 100 g) |
| `js/foods.js` | Busca, extras fora da TACO, pratos, medidas caseiras |
| `js/calc.js` | TMB (Mifflin-St Jeor), metas por tipo de dia, média móvel, ritmo, ajuste de 14 dias, escala de porções |
| `js/ai.js` | Chamadas ao Claude (cardápio e troca de refeição) com saída em JSON estruturado |
| `js/views/*.js` | Uma tela por aba + onboarding |

## Rodar no computador

```bash
python -m http.server 5178
```

Abra http://localhost:5178 (use o modo celular do DevTools).

## Publicar (para instalar no celular)

O PWA precisa de HTTPS. O jeito mais simples é o GitHub Pages:
suba esta pasta para um repositório e ative *Settings → Pages → Deploy from branch (main, /root)*.
No celular, abra o link e use "Adicionar à tela de início".

Ao publicar uma nova versão, aumente `VERSION` em `sw.js` para os celulares baixarem os arquivos novos.

## IA

A geração de cardápio usa a API da Anthropic direto do navegador, com a chave que você cola em **Perfil**
(fica só no aparelho, não vai no backup). A IA escolhe alimentos pelo id da base e as porções; o app
descarta ids inexistentes, recalcula todos os macros pela TACO e ajusta as porções de carboidrato
para a meta de cada dia.
