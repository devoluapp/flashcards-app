# Flashcards SaaS — Especificação do Backend (PocketBase v0.39.7)

> Documento de projeto para abrir no VS Code + Claude Code e finalizar a implementação.
> **Escopo:** backend único e sincronizável, multiusuário, com **FSRS**, upload de imagem com proporção/limite e **importação em lote** (Anki/Quizlet/CSV).
> **Frontend por enquanto:** apenas **Android nativo (Kotlin)**. O frontend web tem documento próprio (`03-web-frontend-build.md`) e o backend já nasce pronto para os dois.

Dono: Roberto · Atualizado: 2026-07-19 · Deploy: VPS 4 vCPU / 16 GB via **Coolify** · **PocketBase v0.39.7 (API JSVM moderna, linha v0.23+).**

---

## 0. O que muda por causa da versão (v0.39.7 / JSVM)

A partir da **v0.23** o PocketBase reescreveu a API. Como você está na **v0.39.7**, use SEMPRE a sintaxe nova. Os pontos que mais afetam este projeto:

| Assunto | Forma **antiga** (≤ v0.22) | Forma **nova** (v0.23+ / a sua) |
|--------|-----------------------------|----------------------------------|
| Schema da coleção | `schema: new SchemaField(...)` | **`fields: [ { type, name, ... } ]`** (props achatadas, sem `options`) |
| Salvar coleção | `Dao`/`CollectionUpsertForm` | **`app.save(collection)`** (valida) / `app.saveNoValidate()` |
| Buscar coleção | `$app.dao().findCollectionByNameOrId()` | **`app.findCollectionByNameOrId()`** |
| Hooks de request | `onRecordBeforeCreateRequest` | **`onRecordCreateRequest((e)=>{ ... e.next() }, "col")`** |
| Objeto do evento | `e.record`, `e.httpContext` | **`e.record`, `e.requestInfo`, `e.next()`** |
| Admin | coleção `admins` | coleção **`_superusers`** (`pocketbase superuser create`) |
| Auth store (SDK JS) | `pb.authStore.model` | **`pb.authStore.record`** |
| URL de arquivo (SDK JS) | `pb.files.getUrl()` | **`pb.files.getURL()`** |
| Tipos de campo | genéricos | **tipados**: `TextField`, `NumberField`, `FileField`, `RelationField`, `SelectField`, `JSONField`, `EditorField`, `BoolField`, `DateField`, `AutodateField` |

Referências: `https://pocketbase.io/v023upgrade/jsvm/` e `https://pocketbase.io/jsvm/`.

---

## 1. Objetivo e princípios

Backend como **fonte da verdade** do estudo. O app Android estuda online/offline; a base sincroniza. O frontend é casca fina — toda regra de dados, auth, storage e acesso vive no backend.

- **Agnóstico de frontend.** Android (agora) e Web (depois) falam a mesma API REST + realtime.
- **Agendamento determinístico.** FSRS é determinístico dado (estado do card + nota + timestamp) ⇒ dispositivos convergem sem conflito.
- **Leve na VPS.** PocketBase = binário único + SQLite. Sobra folga nos 16 GB.
- **Pronto para monetizar.** Campos de `plan`/quota já previstos (free × pro).

---

## 2. Arquitetura

```
        ┌───────────────────────────┐
        │  App Android (Kotlin)     │
        │  FSRS-Kotlin (local)      │
        │  cache offline (Room)     │
        └───────────┬───────────────┘
                    │ REST + Realtime(SSE) + Files
                    ▼
        ┌───────────────────────────┐
        │        PocketBase         │  ← fonte da verdade
        │  auth · SQLite · files    │
        │  pb_migrations · pb_hooks │
        │  realtime · REST          │
        └───────────┬───────────────┘
                    │ (SDK admin)
        ┌───────────▼─────────────────┐
        │   Import Worker (Node)      │  ← parsing pesado (.apkg/.csv/Quizlet)
        │   jszip · sql.js · papaparse│
        └─────────────────────────────┘
```

Três serviços no mesmo `docker-compose` do Coolify: **PocketBase**, **Import Worker** (Node) e, futuramente, o **frontend web**. O Android é externo.

### FSRS: onde roda
- **Agendamento (repeat/next):** no cliente que revisou (Android → **FSRS-Kotlin**; Web → **ts-fsrs**). Persiste `card` + `review_log`.
- **Otimização dos pesos `w`:** tarefa periódica opcional (cron no Worker com `py-fsrs`/`fsrs-optimizer`) a partir de `review_logs`. Só quando houver histórico (~1.000+ revisões). Até lá, pesos padrão do FSRS-6.

---

## 3. O que é FSRS (explicação detalhada)

**FSRS = Free Spaced Repetition Scheduler** — o algoritmo moderno de repetição espaçada (o mesmo adotado pelo Anki), sucessor do SM-2. Versão atual: **FSRS-6**, com **21 parâmetros treináveis** (`w[0..20]`), cujos padrões foram ajustados sobre ~700 milhões de revisões de ~10 mil usuários.

### 3.1. Modelo DSR (as três variáveis)
- **Stability (S) — Estabilidade:** nº de **dias** para a chance de lembrar cair de 100% → **90%**. `S=365` ⇒ ~1 ano até cair a 90%. Acertar aumenta S (intervalos crescem).
- **Difficulty (D) — Dificuldade:** número **1–10**; quão difícil é ganhar estabilidade nesse card. Usa **reversão à média** (diferente do "ease" do SM-2, não fica quebrado pra sempre).
- **Retrievability (R) — Recuperabilidade:** **probabilidade de lembrar agora**, dado o tempo desde a última revisão e S. **Decai continuamente** no tempo.

### 3.2. Curva de esquecimento (lei de potência)
```
R(t) = (1 + FACTOR · t/S) ^ DECAY
```
`t` = dias desde a última revisão. No FSRS-6 o decaimento é aprendido (parâmetro `w20`), não fixo. Quando **R cai abaixo da retenção-alvo**, o card entra para revisão.

### 3.3. Retenção-alvo (desired retention)
Padrão **0.90**. O próximo intervalo é escolhido para que, no vencimento, R = retenção-alvo:
```
intervalo ≈ (S / FACTOR) · (retencao_alvo ^ (1/DECAY) − 1)
```
Retenção maior ⇒ mais revisões, mais retenção. É o botão central de custo × benefício.

### 3.4. Notas e estados
| Nota | Valor | Significado |
|------|-------|-------------|
| Again | 1 | Errou → *lapse* |
| Hard  | 2 | Acertou com dificuldade |
| Good  | 3 | Acertou normal |
| Easy  | 4 | Acertou fácil |

Estados do card: `New → Learning → Review`, com `Relearning` após lapse. Cada revisão recalcula D, S e o próximo `due`.

### 3.5. O que persistir
- **Por card** (espelha o `Card` do FSRS): `due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review`.
- **Por revisão** (`review_log`, **append-only**): `rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, review, duration_ms`. Obrigatório para reotimizar os pesos.

### 3.6. Bibliotecas (open-spaced-repetition)
- **Android nativo (a sua escolha):** **`FSRS-Kotlin`** (FSRS-6).
- **Web (depois):** `ts-fsrs`.
- **Otimização (Python):** `py-fsrs` + `fsrs-optimizer`.

Todas seguem o mesmo algoritmo ⇒ estado compatível entre plataformas.

---

## 4. Modelo de dados (coleções)

Regra de acesso padrão (todas as coleções de dados) — **privado por usuário**:
```
listRule / viewRule / createRule / updateRule / deleteRule:
  @request.auth.id != "" && user = @request.auth.id
```

### 4.1. `users` (auth, estendida)
| Campo | Tipo | Observações |
|------|------|-------------|
| (nativos) | — | email, password, verified… |
| name | text | exibição |
| avatar | file (1, image) | max 1 MB; jpeg/png/webp; thumb 100x100 |
| fsrs_params | json | array dos 21 pesos; vazio ⇒ padrão FSRS-6 |
| desired_retention | number | default 0.9 (0.80–0.97) |
| timezone | text | ex.: `America/Sao_Paulo` |
| plan | select | `free` \| `pro` |
| storage_used | number (int) | bytes de mídia (quota) |
| settings | json | preferências de UI/limites diários |

### 4.2. `decks`
| Campo | Tipo | Observações |
|------|------|-------------|
| user | relation → users | required, cascadeDelete |
| name | text | required |
| description | text | |
| color | text | hex |
| parent | relation → decks | opcional (subdecks) |
| is_public | bool | default false (futuro) |
| deleted | bool | soft delete (sync) |
| created / updated | autodate | |

### 4.3. `cards`
| Campo | Tipo | Observações |
|------|------|-------------|
| user | relation → users | required (denormalizado) |
| deck | relation → decks | required, cascadeDelete |
| front | editor | required |
| back | editor | required |
| front_image | file (1, image) | max 2 MB; jpeg/png/webp; thumbs |
| back_image | file (1, image) | idem |
| media | file (multi, image) | maxSelect 6 (cards ricos) |
| tags | json | array de strings |
| state | select | new/learning/review/relearning (default new) |
| due | date | |
| stability | number | S |
| difficulty | number | D |
| elapsed_days | number | |
| scheduled_days | number | |
| reps | number | |
| lapses | number | |
| last_review | date | |
| suspended | bool | |
| source | text | id do lote de importação |
| deleted | bool | soft delete |
| created / updated | autodate | |

Índices: `deck`, `user`, `due`, `updated` (sync).

### 4.4. `review_logs` (append-only)
`user`(rel), `card`(rel, cascadeDelete), `rating`(number 1–4), `state`(select), `due`(date), `stability`, `difficulty`, `elapsed_days`, `last_elapsed_days`, `scheduled_days`, `review`(date), `duration_ms`(number).
**`updateRule`/`deleteRule` = null** (imutável). Índice em `card` e `review`.

### 4.5. `import_jobs`
`user`(rel), `type`(select anki/quizlet/csv), `file`(file 1), `target_deck`(rel opcional), `options`(json), `status`(select pending/processing/done/error), `result`(json), `created/updated`(autodate).

### 4.6. (futuro) `deck_shares` / `public_decks`
Para vender/compartilhar decks prontos — o "fosso" de conteúdo. `is_public` já deixa aberto.

---

## 5. Migrations (sintaxe v0.39.7 — JSVM)

Coleções versionadas em `pb_migrations/`. Estilo **novo** (props achatadas; `app.save`). Exemplo real de `decks` (os demais seguem o mesmo padrão e estão no scaffold do repositório):

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const usersId = app.findCollectionByNameOrId("users").id;

  const decks = new Collection({
    type: "base",
    name: "decks",
    listRule:   "@request.auth.id != '' && user = @request.auth.id",
    viewRule:   "@request.auth.id != '' && user = @request.auth.id",
    createRule: "@request.auth.id != '' && user = @request.auth.id",
    updateRule: "@request.auth.id != '' && user = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user = @request.auth.id",
    fields: [
      { name: "user", type: "relation", required: true,
        collectionId: usersId, cascadeDelete: true, maxSelect: 1 },
      { name: "name", type: "text", required: true, max: 200 },
      { name: "description", type: "text" },
      { name: "color", type: "text" },
      { name: "parent", type: "relation",
        collectionId: "", cascadeDelete: false, maxSelect: 1 }, // self-rel: ver nota
      { name: "is_public", type: "bool" },
      { name: "deleted", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_decks_user ON decks (user)",
      "CREATE INDEX idx_decks_updated ON decks (updated)",
    ],
  });
  app.save(decks);

  // self-relation: aponta 'parent' para a própria coleção após criada
  decks.fields.getByName("parent").collectionId = decks.id;
  app.save(decks);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("decks"));
});
```

Extensão de `users` usa **campos tipados** com `fields.add(new XField(...))`:

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new NumberField({ name: "desired_retention", min: 0.7, max: 0.99 }));
  users.fields.add(new JSONField({   name: "fsrs_params", maxSize: 200000 }));
  users.fields.add(new TextField({   name: "timezone" }));
  users.fields.add(new SelectField({ name: "plan", maxSelect: 1, values: ["free","pro"] }));
  users.fields.add(new NumberField({ name: "storage_used", onlyInt: true }));
  users.fields.add(new JSONField({   name: "settings", maxSize: 200000 }));
  users.fields.add(new FileField({   name: "avatar", maxSelect: 1, maxSize: 1048576,
    mimeTypes: ["image/jpeg","image/png","image/webp"], thumbs: ["100x100"] }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  ["desired_retention","fsrs_params","timezone","plan","storage_used","settings","avatar"]
    .forEach(n => users.fields.removeByName(n));
  app.save(users);
});
```

> **Campo `file` (imagem)** no schema novo: `{ name, type:"file", maxSelect, maxSize, mimeTypes:[...], thumbs:[...] }`. Ex. em `cards`: `maxSize: 2097152`, `thumbs: ["100x100","400x300f","800x600f"]`.
> As migrations completas de `cards`, `review_logs` e `import_jobs` estão no diretório `backend/pb_migrations/` do scaffold.

---

## 6. Fluxo FSRS (Android/Kotlin)

No app, ao mostrar um card: prever as 4 opções (uma por nota) e exibir o intervalo em cada botão; ao escolher, persistir `card` + `review_log`.

```kotlin
// FSRS-Kotlin (pseudo-fluxo)
val scheduler = FSRS(parameters = user.fsrsParams ?: FSRSParameters.default(),
                     requestRetention = user.desiredRetention)   // 0.9

val fsrsCard = card.toFsrsCard()          // hidrata do registro do PocketBase
val now = Instant.now()
val options = scheduler.repeat(fsrsCard, now)   // Map<Rating, {card, log}>

// usuário clicou "Good"
val (updated, log) = options[Rating.Good]!!

// persistir via SDK Kotlin do PocketBase (ou REST):
pb.collection("cards").update(card.id, mapOf(
  "due" to updated.due, "stability" to updated.stability,
  "difficulty" to updated.difficulty, "elapsed_days" to updated.elapsedDays,
  "scheduled_days" to updated.scheduledDays, "reps" to updated.reps,
  "lapses" to updated.lapses, "state" to updated.state.name.lowercase(),
  "last_review" to (updated.lastReview ?: now)
))
pb.collection("review_logs").create(mapOf(
  "user" to user.id, "card" to card.id, "rating" to log.rating,
  "state" to log.state, "due" to log.due, "stability" to log.stability,
  "difficulty" to log.difficulty, "elapsed_days" to log.elapsedDays,
  "last_elapsed_days" to log.lastElapsedDays, "scheduled_days" to log.scheduledDays,
  "review" to log.review
))
```

**Fila do dia:** cards com `due <= now && suspended = false && deleted = false`, ordenados por `due`, respeitando limites de "novos/dia" e "revisões/dia" (guardados em `users.settings`).

### SDK Kotlin do PocketBase
Não há SDK oficial Kotlin — use comunidade: **`abd3lraouf/pocketbase-kotlin`** (KMP, ativo) ou **`agrevster/pocketbase-kotlin`** (KMP, manutenção). Ambos cobrem auth, CRUD, realtime (SSE) e arquivos. Fallback: chamar a REST direto com **Retrofit/Ktor**. Detalhes de app no doc do Android (a criar); aqui o backend é agnóstico.

---

## 7. Upload de imagem (proporção e tamanho)

Três camadas:
1. **Cliente (garante a proporção):** antes do upload, **crop/resize** para proporção fixa (**4:3** recomendado, ou 16:9), lado maior **≤ 1024 px**, re-encode **WebP** q≈0.8. No Android: `image_cropper`/UCrop.
2. **PocketBase (garante o limite):** campo `file` valida **mimeTypes** e **maxSize** (2 MB) e gera **thumbs** para entrega (`400x300f`, etc.). No cliente: `GET /api/files/cards/{id}/{filename}?thumb=400x300f`.
3. **Hook defensivo (quota):** `onRecordCreateRequest`/`onRecordUpdateRequest` em `cards` para bloquear excesso e atualizar `users.storage_used` por plano.

```js
// pb_hooks/main.pb.js (trecho — sintaxe v0.23+)
onRecordCreateRequest((e) => {
  const auth = e.requestInfo?.auth;
  if (auth && auth.get("plan") === "free" && auth.get("storage_used") > 50 * 1024 * 1024) {
    throw new BadRequestError("Cota de imagens do plano free atingida.");
  }
  e.next();
}, "cards");
```

> PocketBase gera thumbs para entrega, mas não força a proporção do **upload**. Por isso a camada 1 (crop no cliente) é a que realmente garante a proporção. Sufixos de thumb: `WxH` (crop central), `WxHt/WxHb` (topo/base), `WxHf` (fit).

---

## 8. Sincronização multi-dispositivo

- **Soft delete:** marcar `deleted=true` (purga real por cron depois de X dias).
- **Delta pull:** cliente guarda `last_synced_at`; puxa `updated > last_synced_at` por coleção.
- **Push:** fila de mutações locais; `review_logs` são append-only ⇒ nunca conflitam.
- **Realtime (online):** `subscribe` para sync ao vivo.
- **Conflitos:** `cards`/`decks` → last-write-wins por `updated`. Estado de um card é reconstruível a partir dos `review_logs` ordenados, se preciso.
- **Android offline:** espelho Room + fila; reconcilia ao reconectar.

---

## 9. Importação em lote (Anki / Quizlet / CSV)

Fluxo: upload → cria `import_jobs (pending)` → **Import Worker** pega → processa → cria `decks/cards` + sobe mídia → atualiza `status`/`result`. Todo parsing pesado roda **no Worker**, nunca no PocketBase.

- **CSV:** `papaparse`; mapeamento de colunas em `options` (`front, back, tags(;), deck, front_image, back_image`). 1 linha = 1 card.
- **Quizlet:** texto delimitado (sem arquivo oficial). `options`: delimitador termo↔definição (padrão TAB) e entre cards (padrão nova linha / `\n\n`). Sem mídia.
- **Anki `.apkg`:** zip com `collection.anki2`/`anki21` (SQLite: `col`, `notes`, `cards`), `media` (JSON nº→nome) e mídias numeradas. Passos: `jszip` → `sql.js` → ler `col.models` → `notes.flds` separados por **`\x1f`** → mapear 2 primeiros campos como front/back → subir mídia e **reescrever `<img src>`** → criar cards (estado `new`).
  - ⚠️ Exports recentes podem ser `collection.anki21b` (**zstd + protobuf**) — bem mais complexo. **MVP: só `anki2`/`anki21`**; detectar `anki21b` e retornar erro amigável ("reexporte com 'Support older Anki versions'"). zstd via `fzstd` numa fase 2.

Libs do Worker: `jszip`, `sql.js`, `papaparse`, `fzstd` (fase 2), SDK PocketBase (Node).

---

## 10. Segurança, limites e monetização

- **Auth:** e-mail/senha + verificação; OAuth2 (Google) opcional. Admin em `_superusers`.
- **Regras:** privado por `user`; `review_logs` imutável.
- **Rate limiting:** ativar o limiter nativo (auth e create).
- **Planos (`users.plan`):** free (ex.: 3 decks / 500 cards / 50 MB / 1 import/dia) × pro (ilimitado + FSRS otimizado). Enforcement por hooks + checagem no cliente.
- **Backups:** automáticos (S3) — é a fonte da verdade.
- **Mídia:** local no MVP; migrar para S3-compatível (Garage/SeaweedFS do catálogo Coolify, ou R2) ao crescer.

---

## 11. Estrutura do repositório

```
flashcards-backend/
├─ README.md
├─ docker-compose.yml
├─ docs/
│  ├─ 01-backend-spec.md            (este arquivo)
│  ├─ 02-backend-step-by-step.md    (guia passo a passo)
│  └─ 03-web-frontend-build.md      (frontend web)
├─ backend/
│  ├─ Dockerfile
│  ├─ pb_migrations/                (schema versionado — sintaxe v0.39.7)
│  │  ├─ 1721300000_extend_users.js
│  │  ├─ 1721300100_decks.js
│  │  ├─ 1721300200_cards.js
│  │  ├─ 1721300300_review_logs.js
│  │  └─ 1721300400_import_jobs.js
│  └─ pb_hooks/
│     └─ main.pb.js                 (quota/validação)
└─ import-worker/
   ├─ Dockerfile
   ├─ package.json
   ├─ tsconfig.json
   └─ src/{index.ts, pb.ts, parsers/{csv.ts,quizlet.ts,anki.ts}}
```

---

## 12. Decisões já fechadas / em aberto

**Fechadas:** Android nativo (Kotlin) + FSRS-Kotlin; PocketBase v0.39.7; deploy Coolify; imagens começam como upload com crop no cliente; import começa todos os cards como `new`.

**Em aberto (definir ao codar):** proporção padrão da imagem (4:3 × 16:9); SDK Kotlin (abd3lraouf × agrevster × REST puro); framework do frontend web (ver doc 03).

---

## 13. Referências
- FSRS: https://github.com/open-spaced-repetition/awesome-fsrs · FSRS-Kotlin: https://github.com/open-spaced-repetition/FSRS-Kotlin
- PocketBase docs: https://pocketbase.io/docs · JSVM: https://pocketbase.io/jsvm/ · Upgrade v0.23 JSVM: https://pocketbase.io/v023upgrade/jsvm/
- SDK Kotlin (comunidade): https://github.com/abd3lraouf/pocketbase-kotlin · https://github.com/agrevster/pocketbase-kotlin
- awesome-pocketbase: https://github.com/benallfree/awesome-pocketbase
- Formato Anki `.apkg`: documentação da comunidade Anki
