# Flashcards — Construção do Frontend Web

> Documento de projeto para o **frontend web** (fase posterior ao Android). O backend (PocketBase v0.39.7) já está pronto para os dois clientes; aqui detalhamos como construir a casca web.
> Regra de ouro: **nenhuma regra de negócio nova no frontend** — ele orquestra chamadas ao PocketBase e roda o FSRS no cliente.

Relacionado: `01-backend-spec.md` (modelo de dados, FSRS, imagens, sync) e `02-backend-step-by-step.md`.

---

## 1. Stack recomendada

- **SvelteKit** (recomendado): bundle pequeno, ótimo DX, combina muito bem com PocketBase e roda leve como PWA. *Alternativa:* **React + Vite** ou **Next.js**, se você preferir ecossistema React.
- **PocketBase JS SDK** (`pocketbase`) — auth, CRUD, realtime (SSE) e URLs de arquivo.
- **ts-fsrs** — agendamento FSRS-6 no cliente (mesmo algoritmo do `FSRS-Kotlin` do Android ⇒ estado compatível).
- **Dexie** (IndexedDB) — cache offline + fila de sincronização (PWA).
- **Cropper.js** — crop/resize de imagem com proporção fixa antes do upload.
- **Chart.js** — gráficos da tela de estatísticas.
- Estilo: **Tailwind CSS** (ou o que preferir).

> Por que não reaproveitar Kotlin na web: o app é Android nativo; a web é um projeto separado. O que os dois compartilham é a **API** e a **semântica do FSRS**, não o código.

---

## 2. Setup do projeto

```bash
npm create svelte@latest web        # escolha "Skeleton project" + TypeScript
cd web
npm i pocketbase ts-fsrs dexie cropperjs chart.js
npm i -D tailwindcss @tailwindcss/vite
```

`.env`:
```
VITE_PB_URL=https://api.seuflashcards.com
```

Cliente PocketBase compartilhado (`src/lib/pb.ts`):
```ts
import PocketBase from "pocketbase";
export const pb = new PocketBase(import.meta.env.VITE_PB_URL);
// v0.23+: use pb.authStore.record (não .model) e pb.files.getURL (não getUrl)
export const currentUser = () => pb.authStore.record;
```

---

## 3. Autenticação

Fluxos: registro (com verificação de e-mail), login, esqueci a senha (envio de e-mail + confirmação), logout. O SDK persiste a sessão em cookie/localStorage.

```ts
// login
await pb.collection("users").authWithPassword(email, password);
// registro
await pb.collection("users").create({ email, password, passwordConfirm, name });
await pb.collection("users").requestVerification(email);
// esqueci a senha — sempre retorna sucesso, mesmo se o e-mail não existir (anti-enumeração)
await pb.collection("users").requestPasswordReset(email);
// confirmação do reset, na página que lê o {TOKEN} do link do e-mail (?token=...)
await pb.collection("users").confirmPasswordReset(token, password, passwordConfirm);
// logout
pb.authStore.clear();
```

O link do e-mail de reset aponta para `PB_FRONTEND_URL + "/reset-password?token={TOKEN}"` — configurado no backend via a migration `1721300500_reset_password_email.js` e a env `PB_FRONTEND_URL` (ver `02-backend-step-by-step.md` §11).

**AuthGuard:** um `+layout.ts`/`hooks` que redireciona para `/login` se `!pb.authStore.isValid`. Rotas privadas ficam sob um grupo protegido.

---

## 4. Rotas e telas

| Rota | Tela | Função |
|------|------|--------|
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Auth | entrada |
| `/` (ou `/decks`) | Dashboard | lista de decks + nº de vencidos + botão "Estudar" |
| `/decks/[id]` | Deck | listar/gerir cards do deck |
| `/study/[deckId]` | **Estudo** | o coração do app (§5) |
| `/cards/new`, `/cards/[id]/edit` | Editor | front/back rich text + imagem com crop (§6) |
| `/import` | Importação | upload + tipo (Anki/Quizlet/CSV) + opções + status (§7) |
| `/stats` | Estatísticas | revisões/dia, retenção, carga futura |
| `/settings` | Config | retenção-alvo, limites diários, timezone, plano |

Componentes-chave: `DeckCard`, `CardEditor`, `ImageCropUploader`, `StudyCard`, `RatingButtons`, `ImportWizard`, `StatsCharts`, `SyncIndicator`, `AuthGuard`.

---

## 5. Sessão de estudo (com ts-fsrs)

Fluxo: mostra a frente → **Espaço** revela o verso → 4 botões **Again/Hard/Good/Easy** exibindo o intervalo previsto → grava.

`src/lib/fsrs.ts`:
```ts
import { fsrs, generatorParameters, Rating, State } from "ts-fsrs";
import { currentUser } from "./pb";

export function makeScheduler() {
  const u = currentUser();
  const params = generatorParameters({
    request_retention: u?.desired_retention ?? 0.9,
    enable_fuzz: true,
    w: u?.fsrs_params?.length ? u.fsrs_params : undefined, // undefined ⇒ padrão FSRS-6
  });
  return fsrs(params);
}

export function toFsrsCard(rec: any) {
  return {
    due: new Date(rec.due ?? Date.now()),
    stability: rec.stability ?? 0,
    difficulty: rec.difficulty ?? 0,
    elapsed_days: rec.elapsed_days ?? 0,
    scheduled_days: rec.scheduled_days ?? 0,
    reps: rec.reps ?? 0,
    lapses: rec.lapses ?? 0,
    state: rec.state ? State[capitalize(rec.state)] : State.New,
    last_review: rec.last_review ? new Date(rec.last_review) : undefined,
  };
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
```

Componente de estudo (essência):
```ts
import { pb, currentUser } from "$lib/pb";
import { makeScheduler, toFsrsCard } from "$lib/fsrs";
import { Rating } from "ts-fsrs";

const scheduler = makeScheduler();
const now = new Date();
const options = scheduler.repeat(toFsrsCard(rec), now); // preview das 4 notas
// mostrar options[Rating.Again|Hard|Good|Easy].card.due nos botões

async function grade(rating: Rating) {
  const { card, log } = options[rating];
  await pb.collection("cards").update(rec.id, {
    due: card.due.toISOString(), stability: card.stability, difficulty: card.difficulty,
    elapsed_days: card.elapsed_days, scheduled_days: card.scheduled_days,
    reps: card.reps, lapses: card.lapses, state: stateName(card.state),
    last_review: (card.last_review ?? now).toISOString(),
  });
  await pb.collection("review_logs").create({
    user: currentUser()!.id, card: rec.id, rating: log.rating, state: stateName(log.state),
    due: log.due, stability: log.stability, difficulty: log.difficulty,
    elapsed_days: log.elapsed_days, last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days, review: log.review,
  });
}
```

Fila do dia:
```ts
const due = await pb.collection("cards").getList(1, 50, {
  filter: `deck="${deckId}" && due <= "${now.toISOString()}" && suspended=false && deleted=false`,
  sort: "due",
});
```
Atalhos: **Espaço** vira o card; **1–4** dão a nota. Barra de progresso; tela de "concluído" ao esvaziar.

---

## 6. Editor de card + upload de imagem

- Rich text para `front`/`back` (o campo é `editor` no PocketBase).
- **ImageCropUploader:** Cropper.js com **proporção 4:3** fixa; exporta canvas → **WebP** (lado ≤ 1024, q≈0.8) → `Blob`.

```ts
// após o crop:
const blob = await new Promise<Blob>((res) =>
  canvas.toBlob((b) => res(b!), "image/webp", 0.8));
const form = new FormData();
form.append("front_image", blob, "front.webp");
await pb.collection("cards").update(cardId, form);
```

Exibição com thumb:
```ts
const url = pb.files.getURL(rec, rec.front_image, { thumb: "400x300f" });
```

---

## 7. Assistente de importação

1. Escolhe tipo: **CSV / Quizlet / Anki**.
2. CSV: upload + mapeamento de colunas. Quizlet: cola o texto + define delimitadores. Anki: upload do `.apkg`.
3. Cria `import_jobs` (o **Import Worker** processa — ver backend).
4. Acompanha `status` via **realtime**:
```ts
pb.collection("import_jobs").subscribe(jobId, (e) => updateStatus(e.record));
```
Mostra resultado (`result.created`/erros). Para Anki novo (`anki21b`), exibe a instrução de reexportar.

---

## 8. Offline e sincronização (PWA)

- **PWA:** service worker + manifest; o app instala e estuda offline.
- **Cache local:** Dexie (IndexedDB) espelha `decks`/`cards`; a sessão de estudo lê do cache.
- **Fila de mutações:** revisões offline entram numa fila; ao reconectar, dão push (updates de `cards` + creates de `review_logs`, que são append-only e nunca conflitam).
- **Delta pull:** guardar `last_synced_at`; puxar `updated > last_synced_at`.
- **Realtime (online):** `pb.collection('cards').subscribe('*', ...)` para refletir mudanças de outro dispositivo ao vivo.
- **Conflitos:** last-write-wins por `updated` em `cards`/`decks`.

```ts
// pull incremental
const changes = await pb.collection("cards").getFullList({
  filter: `updated > "${lastSync}"`, sort: "updated",
});
```

---

## 9. Estatísticas

Com base em `review_logs` do usuário: revisões por dia, distribuição de notas, **retenção real vs. alvo**, e **previsão de carga** (contagem de `cards` por `due` nos próximos dias). Renderizar com Chart.js.

---

## 10. Deploy no Coolify

- Build estático do SvelteKit (adapter `static` ou `node`).
- No Coolify: novo recurso apontando para o repo do `web/` (ou servir os estáticos por um Nginx/Static site).
- Definir `VITE_PB_URL` para a URL pública do PocketBase.
- **CORS:** liberar o domínio do frontend nas configurações do PocketBase.
- Domínio próprio + HTTPS pelo Coolify.

---

## 11. Roadmap do frontend web

- [ ] Setup + Tailwind + cliente PB + AuthGuard.
- [ ] Auth (registro/login/verificação/reset).
- [ ] Dashboard de decks + contagem de vencidos.
- [ ] Editor de card + ImageCropUploader (4:3, WebP).
- [ ] **Sessão de estudo** com ts-fsrs (preview das 4 notas + atalhos).
- [ ] Assistente de importação + status em realtime.
- [ ] PWA + cache offline (Dexie) + fila de sync.
- [ ] Estatísticas (Chart.js).
- [ ] Settings (retenção, limites, timezone, plano).
- [ ] Deploy no Coolify + CORS + domínio.

---

## 12. Consistência com o Android

O que **deve** ficar igual nos dois clientes para o sync funcionar sem surpresa:
- Mapeamento dos campos FSRS do card (nomes e semântica) — §5.
- Nomes dos estados (`new/learning/review/relearning`) e das notas (1–4).
- Estratégia de soft delete + delta pull por `updated`.
- Crop de imagem na **mesma proporção** (4:3) para não gerar recortes diferentes.
