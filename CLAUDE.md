# Contexto do projeto — Flashcards (monorepo)

> **Leia este arquivo antes de qualquer alteração.** Ele reflete o estado ATUAL da
> implementação (não o histórico). Não é changelog — é o "mapa do território" para
> qualquer sessão (humana ou IA) trabalhar sem precisar reler tudo do zero.
>
> **Regra de manutenção:** a cada alteração relevante neste repo, (1) faça commit
> com mensagem em português, clara e específica sobre o "porquê"; (2) atualize este
> documento no MESMO commit para refletir o novo estado — edite in-place (sobrescreva
> a seção afetada), não acrescente entradas históricas nem changelog aqui. Se algum
> dia for necessário preservar uma versão antiga, use `git log -p -- PROJECT_CONTEXT.md`
> (o histórico já vive no git) em vez de inflar este arquivo. Mantenha o documento
> coeso e enxuto — é para economizar tokens/tempo de contexto, não para ser exaustivo.

## Visão geral

App de flashcards com repetição espaçada (FSRS), multiusuário. Três componentes
neste monorepo + 1 externo:

- **`backend/`** — PocketBase (Go, binário único + SQLite) v0.39.7, com schema
  (`pb_migrations/`) e regras de negócio em JS (`pb_hooks/main.pb.js`). É a única
  fonte de verdade de dados e autenticação.
- **`web/`** — SvelteKit 2 / Svelte 5 (runes), compilado como SPA estática
  (`adapter-static`) e servida por nginx. Único cliente da API PocketBase hoje.
- **`import-worker/`** — serviço Node/TS que processa importações em lote
  (Anki/Quizlet/CSV) de forma assíncrona, fora do PocketBase.
- **App Android nativo (Kotlin)** — repositório separado, fora deste monorepo. Só
  fala com a mesma API PocketBase; nada aqui depende dele.

Deploy: Coolify, cada serviço acima como recurso próprio a partir deste mesmo repo
Git, deploy automático a cada push em `main` via webhook. Detalhes operacionais
(SMTP, backups, hardening, variáveis de ambiente) estão em `DEPLOY-COOLIFY.md` —
este documento aqui é sobre *como o código funciona*, não sobre operar o Coolify.

URLs de produção: `flashcards.concurseirotop10.online` (front) e
`pb.devoluapp.cloud` (API PocketBase).

## Backend — PocketBase (`backend/`)

- `Dockerfile` baixa o binário do PocketBase (versão fixada por `PB_VERSION` build
  arg, hoje 0.39.7) e embute `pb_migrations/` e `pb_hooks/` **dentro da imagem** —
  cada tag/release da imagem já carrega o schema e as regras que valiam quando foi
  buildada. `entrypoint.sh` garante (upsert) o superuser a partir de
  `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD` no boot.
- `pb_data/` (SQLite + arquivos enviados) é o único estado runtime, montado via
  bind mount em caminho fixo no host (não volume nomeado do Compose) — decisão
  deliberada para evitar recreation de volume no Coolify e permitir backup por
  caminho direto.
- Sintaxe das migrations e hooks: JSVM **v0.23+** (a versão instalada é 0.39.7,
  então mais recente ainda — conferir https://pocketbase.io/jsvm/ se algo mudar).

### Modelo de dados (coleções)

Espelhado em `web/src/lib/types.ts` (comentário no topo do arquivo aponta essa
obrigação de sincronia — ao mudar uma migration, atualize `types.ts` junto).

| Coleção | Campos próprios (além de id/created/updated) | Regra de acesso |
|---|---|---|
| `users` (auth, builtin) | `plan` (`free`\|`pro`), `desired_retention` (0.7–0.99), `fsrs_params` (json, pesos custom do FSRS), `timezone`, `storage_used` (bytes), `settings` (json livre), `avatar` (file), `is_admin` (bool, dá acesso à tela `/admin/import`; só editável via painel PB — ver hook 6) | `authRule = "verified = true"` — só loga quem confirmou e-mail |
| `decks` | `user` (rel), `name`, `description`, `color`, `cover_image` (file), `parent` (self-rel, subdecks), `is_public`, `deleted` (soft delete) | list/view/update/delete: dono **e** `verified = true`; create: só autenticado (dono é setado pelo hook, não pela rule) |
| `cards` | `user`, `deck` (rel), `front`/`back` (rich text/"editor"), `front_image`/`back_image`/`media` (files), `tags` (json), campos de estado FSRS (`state`, `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `last_review`), `suspended`, `source`, `deleted`, `image_search`/`image_prompt` (texto; metadados de imagem mnemônica do CSV admin — persistem no card mas só a tela `/admin/import` os exibe/edita) | mesma regra de `decks` |
| `review_logs` | `user`, `card` (rel), `rating` (1–4), snapshot do estado FSRS no momento da review, `duration_ms` | **imutável**: `updateRule`/`deleteRule = null`; só create/list/view do próprio dono |
| `import_jobs` | `user`, `type` (`anki`\|`quizlet`\|`csv`), `file`, `target_deck`, `options` (json), `status` (`pending`\|`processing`\|`done`\|`error`), `result` (json: `{created, total}` ou `{error}`) | dono cria/lê; quem processa (`import-worker`) é superuser, passa por cima das rules |

### Regras de negócio (`pb_hooks/main.pb.js`)

1. **`forceOwner`** — em `onRecordCreateRequest` de `decks`/`cards`/`review_logs`/
   `import_jobs`, força `record.user = auth.id` do usuário autenticado. Existe
   porque a `createRule` roda em "dry submit" *antes* deste hook (quando `user`
   ainda está vazio) — por isso as rules de create só checam
   `@request.auth.id != ''`, nunca comparam `user` diretamente. Superusers (o
   `import-worker` autenticado como superuser) ficam de fora dessa sobrescrita,
   porque o id de um superuser não existe na coleção `users`.
2. Cota de imagem do plano free: bloqueia create em `cards` se
   `storage_used > 50MB` e `plan = "free"`.
3. Limite de decks do plano free: bloqueia create em `decks` além de 3 decks.
4. Cards novos sem `state` explícito nascem com FSRS zerado (`state: "new"`,
   `reps/lapses/stability/difficulty: 0`).
5. `import_jobs` sempre nasce com `status: "pending"` se não vier setado — é o
   único lugar que define esse default; o worker só varre por esse status.
6. `users.is_admin` é revertido ao valor original em todo `onRecordUpdateRequest`
   de não-superuser — sem isso qualquer usuário se auto-promoveria via PATCH
   (a updateRule de `users` permite o dono editar o próprio registro). Promover
   admin = marcar o campo no painel do PB. O gating da tela `/admin/import` no
   front é só UX; a garantia real é este hook (a tela não faz nada privilegiado
   no servidor — só operações que o dono já pode nos próprios registros).

**Não há integração de IA no backend nem no import-worker.** O que existe é um
prompt pronto (ver seção Frontend) para o usuário colar em uma ferramenta externa
(NotebookLM etc.) e depois importar o CSV gerado — nenhuma chamada de LLM roda
neste código. (A tela admin do front chama OpenAI/bancos de imagem **direto do
navegador**, com chaves do próprio admin em localStorage — o backend não participa.)

## Frontend web (`web/`)

Stack: SvelteKit 2 + Svelte 5 (runes: `$state`, `$derived`, classes `.svelte.ts`
para stores), Tailwind 4, `adapter-static` (build vira SPA pura, sem SSR em
runtime — por isso rotas dinâmicas como `/decks/[id]` dependem do fallback
`try_files ... /index.html` no nginx). Cliente PocketBase oficial (`pocketbase`
npm) + `ts-fsrs` para o algoritmo de repetição espaçada rodando **no cliente**
(o PocketBase só armazena o estado resultante, não calcula FSRS).

Build-time vs runtime: `PUBLIC_PB_URL` e `PUBLIC_APP_VERSION` são lidas via
`$env/static/public`, ou seja, **ficam embutidas no bundle no build** — trocar só
no runtime do container não tem efeito, precisa rebuildar a imagem (no Coolify,
marcar como "Available at Buildtime").

### Estrutura

- `src/lib/pb.ts` — client singleton do PocketBase (`pb`), helper `currentUser()`
  (lê `pb.authStore.record`, API v0.23+, não mais `.model`) e `fileUrl()` (usa
  `pb.files.getURL`, não `getUrl`).
- `src/lib/types.ts` — tipos TS espelhando o schema do PocketBase (ver tabela
  acima). **Fonte de verdade secundária**: qualquer mudança de schema no backend
  precisa refletir aqui.
- `src/lib/fsrs.ts` — wrapper do `ts-fsrs`: `makeScheduler()` monta o
  `fsrs()` usando `desired_retention` e `fsrs_params` do usuário logado;
  `toFsrsCard`/`stateName` convertem entre o formato do PocketBase (`CardRecord`)
  e o formato esperado pela lib (`FsrsCard`, enum `State`).
- `src/lib/stores/auth.svelte.ts` — store reativa de sessão, espelha
  `pb.authStore` (`user`, `isValid`) via `onChange`.
- `src/lib/stores/theme.svelte.ts` / `toast.svelte.ts` — tema (claro/escuro) e
  notificações toast.
- `src/lib/components/` — `DeckCard`, `CardEditor`, `RichTextEditor` (edita
  `front`/`back`, que são campos tipo `editor` no schema), `ImageCropUploader`
  (upload com crop/proporção via `cropperjs`, usado em avatar, capa de deck e
  imagens de card — ver "Upload de imagens" abaixo), `RatingButtons` (as 4
  notas do FSRS: Errei/Difícil/Bom/Fácil), `AiPromptHelper` (só copia um prompt
  para colar em IA externa — não chama nenhuma API de IA; `context` `'import'` |
  `'card'` | `'admin'`, sendo `admin` a variante com colunas
  `image_search`/`image_prompt`), `Nav` (para `is_admin`, a aba "Importar" vira
  "Importar (Admin)" apontando pra `/admin/import` — admin não vê a tela comum
  de importação), `Modal`, `HelpTip`, `ToastHost`, `AppFooter`.
- `src/lib/components/admin/` — `ApiKeysPanel` (chaves Pixabay/Pexels/Unsplash/
  OpenAI + modelo, persistidas via `stores/adminKeys.svelte.ts` em localStorage)
  e `CardImagePicker` (grade de 3 imagens buscadas + slot da gerada, seleção,
  botões anteriores/próximas/Gerar, salva `back_image`).
- `src/lib/image-search/` — provedores de busca de imagem com contrato comum
  (`types.ts`), um arquivo por provedor e `session.svelte.ts`
  (`ImageSearchSession`: cadeia Pixabay → Pexels → Openverse → Unsplash filtrada
  por chave disponível, paginação de 3 em 3 com cache das páginas; Openverse não
  exige chave e usa **só o endpoint de thumbnail** — o `url` direto não garante
  CORS). `src/lib/image-gen/openai.ts` — `generateImage()` chama
  `POST /v1/images/generations` da OpenAI direto do browser (gpt-image-1 sem
  `response_format`; dall-e-3/2 com `b64_json`).
- `src/lib/image-compress.ts` — util compartilhado de compressão WebP:
  `canvasToWebpUnderLimit` (loop de qualidades, usado pelo `ImageCropUploader`)
  e `blobToWebpResized` (redimensiona sem crop, usado pela tela admin).
- `src/routes/` — uma rota por tela: `/` (home), `/login`, `/register`,
  `/forgot-password`, `/reset-password`, `/verify-email`, `/decks`,
  `/decks/[id]` (edição de deck + lista de cards), `/study/[deckId]` (sessão de
  revisão, usa `fsrs.ts` para agendar), `/import` (upload Anki/Quizlet/CSV, cria
  `import_jobs`), `/admin/import` (ver "Tela admin" abaixo), `/settings`
  (perfil, tema, fuso horário via combobox, `desired_retention`), `/stats`
  (gráficos com `chart.js`).

### Tela admin de importação com imagens (`/admin/import`)

Visível/acessível só para `users.is_admin` (link na Nav + redirect no `onMount`
da página — **não** usar `goto()` dentro de `$effect`: rastreia estado interno do
router e entra em loop `effect_update_depth_exceeded`). Fluxo em 2 passos, tudo
client-side, sem `import_jobs`/worker:

1. CSV (arquivo ou texto colado) com cabeçalho
   `front,back,tags,image_search,image_prompt` (3 últimas opcionais por linha),
   parseado com `papaparse` no browser; cria os `cards` (texto) na hora via
   `pb.collection('cards').create` com `source: 'admin-import'` e persiste
   `image_search`/`image_prompt` no próprio card.
2. Edição em lote paginada (1/5/10 por página): cada card visível busca 3 imagens
   (`ImageSearchSession`, lazy — só a página visível, pra poupar rate limit) e/ou
   gera via OpenAI; `image_search`/`image_prompt` são editáveis no
   `CardImagePicker` (persistem no card via update; editar a busca recomeça a
   sessão com o novo termo); a imagem escolhida é baixada, comprimida
   (`blobToWebpResized`, 1024px/2MB) e salva em `back_image`. As sessões de
   busca vivem só em memória (`beforeunload` avisa se houver card sem imagem) —
   cards de texto e metadados já estão salvos no PB de qualquer forma.

### Upload de imagens (avatar, capa de deck, frente/verso de card)

Todo upload de imagem passa por `ImageCropUploader.svelte`, que recorta
(`cropperjs`) e **recomprime no navegador para WebP** antes de enviar — nunca
manda o arquivo original. Cada caso de uso chama o componente com
`aspectRatio`/`maxSide`/`maxBytes` batendo com o limite do campo equivalente no
PocketBase (`pb_migrations`):

| Uso | Onde | aspectRatio | maxSide | maxBytes | limite do campo |
|---|---|---|---|---|---|
| Avatar | `routes/settings/+page.svelte` | 1:1 | 512 | 1.000.000 | `avatar` = 1 MB |
| Capa de deck | `routes/decks/+page.svelte` | 16:9 | 800 | padrão (2 MB) | `cover_image` = 2 MB |
| Frente/verso de card | `CardEditor.svelte` | 4:3 (padrão) | 1024 (padrão) | padrão (2 MB) | `front_image`/`back_image` = 2 MB |

A compressão em si vive em `src/lib/image-compress.ts`
(`canvasToWebpUnderLimit`: tenta qualidades WebP decrescentes
`QUALITY_STEPS = [0.8, 0.6, 0.4, 0.25]` até caber em `maxBytes`, senão lança
`ImageTooLargeError`); o `confirmCrop()` do componente usa esse util e avisa via
toast (pedir pra recortar uma área menor) em vez de deixar o PocketBase rejeitar
com erro genérico. Em qualquer compressão perceptível, mostra um toast informando
o tamanho antes/depois (transparência pro usuário). **Se adicionar um novo ponto
de upload de imagem, nunca enviar o `File`/blob bruto**: fluxo interativo passa
pelo `ImageCropUploader`; fluxo automático (sem crop, ex.: tela admin baixando
imagem da web) passa por `blobToWebpResized` do mesmo util — foi exatamente esse
o bug corrigido no avatar (única tela que ainda enviava o arquivo original sem
recorte/compressão).

### Fluxo de revisão (FSRS)

1. `study/[deckId]` carrega os cards devidos do deck (via API rules, filtra por
   `deck` + `due <= now` + `suspended = false` etc.).
2. Para cada card, `toFsrsCard()` converte o registro PocketBase pro formato da
   lib; `makeScheduler()` monta o scheduler com os parâmetros do usuário.
3. Usuário avalia (`Rating.Again/Hard/Good/Easy` via `RatingButtons`); o
   scheduler devolve o novo estado (due, stability, difficulty, etc.).
4. O client grava o novo estado em `cards` (update) e cria um `review_logs`
   (snapshot imutável da review) — os dois writes são feitos direto do browser
   contra o PocketBase, sujeitos às API rules de dono+verificado.

### Fluxo de importação (Anki/Quizlet/CSV)

1. Usuário sobe um arquivo em `/import`; o client cria um `import_jobs`
   (`status` nasce `pending` pelo hook) com o arquivo anexado e `target_deck`
   opcional.
2. `import-worker` (processo separado, sempre rodando) autentica como superuser
   PocketBase e:
   - ao subir, varre `import_jobs` com `status = "pending"` e processa cada um;
   - depois disso, fica inscrito via **SSE** (`pb.collection("import_jobs").subscribe`)
     esperando novos jobs em tempo real.
3. Processamento (`processJob` em `import-worker/src/index.ts`): marca
   `processing` → baixa o arquivo → garante/cria o deck destino (`ensureDeck`) →
   escolhe o parser certo (`parsers/{csv,quizlet,anki}.ts`) → cria um `cards` por
   flashcard extraído (via `FormData`, incluindo imagens se houver) → marca
   `done` com `{created, total}` ou `error` com a mensagem.
4. Todo o parsing pesado roda **só no worker**, nunca dentro de hooks do
   PocketBase (JSVM não é ambiente adequado pra isso).

## Como rodar localmente

Ver `README.md` (raiz) — resumo: PocketBase local via binário ou
`docker-compose-local.yml`, `import-worker` via `npm run dev` (usa `tsx watch`),
`web` via `npm run dev` (Vite). Testes: `scripts/smoke-test.sh` (integração,
REST real, precisa do superuser local) e `cd import-worker && npm test`
(unitário, vitest, cobre os 3 parsers).

## Armadilhas conhecidas (não redescobrir)

- `~/.npmrc` da máquina aponta para um Nexus privado de trabalho; `web/.npmrc`
  fixa o registry público do npm — conferir depois de qualquer mudança de
  dependência (já causou deploy quebrado uma vez, ver commit
  `30634e1`/histórico do `web/.npmrc`).
- No Coolify, sempre confirmar o toast de sucesso do "Save" antes de clicar em
  "Deploy" — a v4.1.2 pode disparar deploy com config antiga se o Save não foi
  confirmado.
- PocketBase v0.23+: usar `pb.authStore.record` (não `.model`) e
  `pb.files.getURL` (não `getUrl`) — APIs antigas quebram silenciosamente.
- `e.auth` nos hooks é propriedade, não `e.requestInfo.auth` (método, sempre
  undefined).
