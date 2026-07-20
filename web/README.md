# Flashcards — Web (SvelteKit)

Frontend web do app de flashcards com **FSRS**, dentro do monorepo `flashcards-app`
(irmão de `backend/` e `import-worker/` — ver `../README.md`). Consome o backend
PocketBase — não implementa nenhuma regra de negócio própria, só orquestra chamadas
à API e roda o agendamento FSRS no cliente (`ts-fsrs`), como definido em
`../docs/03-web-frontend-build.md`.

## Stack

- **SvelteKit 2 / Svelte 5** (runes) + TypeScript, build estático (`adapter-static`, modo SPA).
- **Tailwind CSS v4** (`@tailwindcss/vite`).
- **pocketbase** (JS SDK) — auth, CRUD, realtime (SSE), URLs de arquivo.
- **ts-fsrs** — agendamento FSRS no cliente (mesmo algoritmo do FSRS-Kotlin do app Android).
- **Cropper.js v2** — recorte de imagem 4:3 antes do upload (exporta WebP).
- **Chart.js** — gráficos da tela de estatísticas.

## Pré-requisitos

- Node 20+.
- O backend rodando localmente — veja o `README.md` na raiz do repo. Resumo:
  ```bash
  cd ..
  docker compose -f docker-compose-local.yml up -d --build
  docker compose -f docker-compose-local.yml exec pocketbase \
    /pb/pocketbase superuser upsert admin@local.dev 'SenhaLocal123!'
  ```
  Isso sobe o PocketBase em `http://localhost:8090` e o Import Worker.

## Rodando local

```bash
npm install
cp .env.example .env   # já vem apontando para http://127.0.0.1:8090
npm run dev
```

Abra `http://localhost:5173` (ou a porta que o Vite indicar). Crie uma conta pela tela de
registro — não é preciso nada no painel do PocketBase.

## Variáveis de ambiente

| Variável | Descrição | Default (`.env.example`) |
|---|---|---|
| `PUBLIC_PB_URL` | URL do PocketBase (backend) | `http://127.0.0.1:8090` |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | Build estático de produção (pasta `build/`) |
| `npm run preview` | Serve o build de produção localmente |
| `npm run check` | Type-check (svelte-check) |

## Estrutura

```
src/
  lib/
    pb.ts                 # cliente PocketBase + helpers (currentUser, fileUrl)
    types.ts              # tipos espelhando o schema do backend (mantenha em sincronia)
    fsrs.ts                # wrapper do ts-fsrs (scheduler, conversão de estado)
    format.ts              # formatação de intervalos (1min, 3d, 2mo…)
    stores/
      auth.svelte.ts       # sessão reativa (baseada em pb.authStore)
      toast.svelte.ts       # notificações globais
    components/
      Nav.svelte, Modal.svelte, ToastHost.svelte
      DeckCard.svelte, CardEditor.svelte, RichTextEditor.svelte
      ImageCropUploader.svelte   # Cropper.js v2, recorte 4:3 -> WebP
      RatingButtons.svelte        # botões Again/Hard/Good/Easy da sessão de estudo
  routes/
    +layout.svelte          # shell + auth guard (client-side, ssr=false)
    login/, register/
    decks/                   # dashboard (lista de decks, cota do plano free)
    decks/[id]/              # cards do deck (criar/editar/excluir/suspender)
    study/[deckId]/           # sessão de estudo (FSRS, atalhos de teclado)
    import/                   # assistente de importação (CSV/Quizlet/Anki) + status realtime
    stats/                     # gráficos (Chart.js)
    settings/                  # perfil, retenção-alvo, senha, plano
```

## Funcionalidades implementadas

Cobre os itens 1–5, 7 e 9 do roadmap em `../docs/03-web-frontend-build.md`:

- [x] Auth: registro, login, logout, guarda de rotas client-side.
- [x] Dashboard de decks com contagem de vencidos e cota do plano free (3 decks).
- [x] CRUD de cards: editor com texto rico (negrito/itálico/sublinhado/lista), tags,
      upload de imagem com **recorte 4:3 → WebP** (frente e verso).
- [x] **Sessão de estudo** com `ts-fsrs`: preview dos 4 intervalos antes de avaliar,
      atalhos de teclado (**espaço** revela, **1–4** avalia), barra de progresso.
- [x] Assistente de **importação** (CSV / Quizlet colado / Anki `.apkg`) com status em
      **tempo real** (realtime/SSE) e mensagem amigável para `.apkg` no formato novo (`anki21b`).
- [x] **Estatísticas**: revisões/dia (30d), distribuição de notas, retenção real vs. meta,
      previsão de carga (14 dias).
- [x] Configurações: nome, avatar, fuso horário, retenção-alvo do FSRS, troca de senha,
      uso de armazenamento do plano free.

### Não implementado nesta versão (item 6 do roadmap do backend)

- **PWA / offline / fila de sincronização** (service worker, cache com Dexie, sync delta).
  O app hoje **requer conexão** com o backend — é a peça mais complexa do roadmap e fica
  para uma iteração futura. O cliente PocketBase e os tipos já estão isolados em `src/lib/`,
  então adicionar cache/fila depois não deve exigir reescrever telas.
- Upgrade de plano (free → pro): o botão existe na UI mas fica desabilitado — não há
  fluxo de pagamento no backend ainda.
- Compartilhamento de decks públicos (`is_public` existe no schema, mas não há tela
  para navegar decks de outros usuários).

## Nota de segurança: conteúdo rico dos cards

O front/back dos cards é HTML (campo `editor` no PocketBase) e é renderizado com `{@html}` na
tela de estudo. Hoje isso é seguro porque cada usuário só vê o **próprio** conteúdo (API Rules
do backend são privadas por dono) — na pior hipótese um usuário injeta algo no próprio card, o
que não afeta ninguém além dele (self-XSS). **Se no futuro for implementado compartilhamento de
decks públicos** (`is_public`), o HTML de outro usuário passa a ser renderizado no seu navegador
e isso vira XSS de verdade — nesse momento, sanitize o HTML (ex.: `DOMPurify`) antes de
renderizar conteúdo que não é do próprio usuário autenticado.

## Deploy no Coolify

Ver `../DEPLOY-COOLIFY.md` (raiz do repo) — cobre o `Dockerfile`/`nginx.conf` deste
diretório (build estático + nginx com fallback de SPA), as envs `PUBLIC_PB_URL` e
`PUBLIC_APP_VERSION` (precisam ser marcadas **buildtime** no Coolify) e o workflow
de release por tag semver.

## Consistência com o Android

Ver `../docs/03-web-frontend-build.md` §12: nomes/semântica dos campos FSRS,
nomes dos estados (`new/learning/review/relearning`) e notas (1–4), soft delete, e crop de
imagem sempre em **4:3** — tudo isso já está implementado igual aqui, para o sync entre
clientes não ter surpresas.
