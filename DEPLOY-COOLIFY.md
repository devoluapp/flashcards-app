# Deploy no Coolify — Flashcards (monorepo: backend + frontend web)

Guia único, do zero, pra colocar no ar os dois recursos deste **mesmo repositório**
(`flashcards-app`):

- **`backend/` + `import-worker/`** (raiz do repo, `docker-compose.yml`) — PocketBase +
  import-worker.
- **`web/`** — SvelteKit estático + nginx.

O app Android é um projeto à parte, em repositório próprio — nada neste guia o afeta.

Cobre: por que sua tentativa anterior não subiu, como configurar os dois recursos
certos no Coolify (os dois apontando pro mesmo repo, cada um com sua própria "Base
Directory"), como o volume de dados (`pb_data`) sobrevive a cada deploy, e como uma
tag `vX.Y.Z` passa a disparar sozinha um novo deploy dos dois juntos — com a versão
aparecendo no rodapé do site.

> Pré-requisitos que este guia **não** cobre: instalar o Coolify em si e conectar um
> servidor a ele. Assumimos que você já tem um Coolify rodando e com um servidor
> (a própria VPS onde o Coolify está, ou outra) disponível para receber os recursos.

---

## 0. Por que "colar o docker-compose.yml em Docker Compose Empty" não funcionou

No Coolify existem (pelo menos) dois jeitos de rodar um `docker-compose.yml`, e eles
**não são intercambiáveis**:

| | `Project → + New Resource` → card **"Docker Compose Empty"** (em "Docker Based") | `Project → + New Resource` → card **"Private Repository (with Deploy Key)"** (em "Git Based") → campo **Build Pack = "Docker Compose"** |
|---|---|---|
| Origem do compose | Você cola o YAML direto na UI | O Coolify clona um repositório Git de verdade |
| Acesso ao código-fonte | **Não tem** — só existe o YAML colado | Tem o checkout completo do repo |
| `build: context: ./backend` | **Falha** (não existe pasta `./backend` nenhuma — o "contexto" está vazio) | Funciona (a pasta existe no checkout) |
| Bom para | Colar um compose que só usa `image:` prontas (Postgres, Redis, etc.) | Qualquer stack que precisa buildar Dockerfiles do seu próprio código |

O nosso `docker-compose.yml` builda duas imagens a partir de código do repositório
(`./backend` e `./import-worker`) — por isso **precisa** ser o segundo tipo, puxando
de um repo Git. É exatamente esse o motivo de nada ter subido: a opção "Docker
Compose Empty" nunca teve acesso aos arquivos do seu projeto para buildar.

> **Onde fica esse tal de "Build Pack = Docker Compose", na prática (testado no
> Coolify 4.1.2):** não é um card visível na tela inicial de "New Resource" — só
> aparecem lá os cards "Dockerfile", "Docker Compose Empty" e "Docker Image" (seção
> "Docker Based"). O "Build Pack" é um **dropdown que só aparece depois** que você
> clica num card Git ("Public Repository", "Private Repository (with GitHub App)" ou
> "Private Repository (with Deploy Key)") e a tela seguinte pede Repository URL/
> Branch — é *nesse* formulário que existe o campo **Build Pack**, com as opções
> Nixpacks / Railpack (Beta) / Static / Dockerfile / **Docker Compose**. Fácil de não
> achar se você ficar só olhando os cards da primeira tela.

A partir daqui o guia usa sempre **card Git (Private Repository with Deploy Key) →
Build Pack "Docker Compose"** (backend) e **card Git → Build Pack "Dockerfile"**
(frontend), as duas apontando pro **mesmo repositório** Git, cada uma com sua
própria "Base Directory".

---

## 1. Criar o repositório no GitHub

O projeto já está com `git init` feito e o primeiro commit pronto localmente (backend
+ frontend juntos, fluxo de "esqueci a senha", Dockerfiles ajustados, workflow de
deploy por tag). Falta só criar o repositório remoto vazio e empurrar.

1. No GitHub, crie **um repositório vazio** (sem README, sem `.gitignore`, sem
   license — já temos tudo local): por exemplo `devoluapp/flashcards-app` (privado,
   recomendado — o projeto tem lógica de negócio e nada aqui precisa ser público).
2. No seu terminal:
   ```bash
   cd ~/ws-negocios/flashcards-app
   git remote add origin git@github.com:devoluapp/flashcards-app.git
   git push -u origin main
   ```
   (troque `devoluapp` pela organização/conta que preferir usar.)

✅ **Pronto quando:** o repositório aparece no GitHub com o commit inicial (backend
e `web/` juntos).

---

## 2. Conectar o Coolify ao GitHub

No Coolify: **Keys & Tokens → Private Keys** (ou **Sources**, dependendo da versão)
→ adicione uma **Deploy Key** genérica, ou instale a **GitHub App** do Coolify se
preferir integração mais rica (webhooks nativos, etc. — não precisamos disso aqui,
já que o deploy será disparado pela tag via Actions, não por push).

O caminho mais simples e que funciona com qualquer conta GitHub (sem instalar App):

1. Ao criar o **primeiro** dos dois recursos (próximo passo), escolha **"Private
   Repository (with deploy key)"** como origem, apontando pro repo `flashcards-app`.
2. O Coolify mostra uma chave pública SSH — copie e cole em
   **GitHub → repositório → Settings → Deploy keys → Add deploy key** (marque
   "Allow write access" **desmarcado** — só precisa ler).
3. Ao criar o **segundo** recurso, reaproveite a mesma chave/fonte já cadastrada no
   Coolify (não precisa repetir o passo no GitHub) — é o mesmo repositório, só muda
   a "Base Directory" de cada recurso.

✅ **Pronto quando:** o Coolify consegue clonar o repo (teste no próximo passo).

---

## 3. Recurso do backend (PocketBase + import-worker)

Passo a passo exato na UI (não existe um card "Docker Compose" na tela inicial —
veja o quadro na seção 0 se isso não fizer sentido ainda):

1. Abra o projeto (ex.: **Devoluapp**) → aba **Production** (ou o environment que
   você usa) → **+ New**.
2. Na tela "New Resource", em **Applications → Git Based**, clique **"Private
   Repository (with Deploy Key)"** (reaproveita a deploy key da seção 2 — **não**
   clique em "Docker Compose Empty", que fica em "Docker Based" e é o tipo errado).
3. Selecione a deploy key cadastrada (ex.: `github_devoluapp_key`).
4. Abre o formulário "Create a new Application". Preencha:
   - **Repository URL**: `git@github.com:devoluapp/flashcards-app.git`
   - **Branch**: `main`
   - **Build Pack**: troque de "Nixpacks" (padrão) para **"Docker Compose"**
   - **Base Directory**: `/`
5. Clique **Continue**. Só depois desse clique é que aparece o campo **Docker
   Compose Location** — confirme que está `/docker-compose.yml` (ou ajuste, se o
   Coolify sugerir outro caminho).

Configuração (resumo dos campos que importam, alguns já preenchidos acima):

| Campo | Valor |
|---|---|
| Branch | `main` |
| Base Directory | `/` |
| Docker Compose Location | `/docker-compose.yml` |
| Automatic deployment (push) | **desligado** — os deploys acontecem só via tag (passo 8) |

### 3.1 Variáveis de ambiente

Aba **Environment Variables** do recurso:

| Chave | Valor | Observação |
|---|---|---|
| `PB_ADMIN_EMAIL` | seu e-mail de admin | usado pelo `pocketbase` (cria/atualiza o superuser no boot — ver `backend/entrypoint.sh`) e pelo `import-worker` pra autenticar |
| `PB_ADMIN_PASSWORD` | senha forte (8+ caracteres, mínimo exigido pelo PocketBase) | idem — gere algo longo, não reaproveite senha |
| `PB_FRONTEND_URL` | `https://app.seuflashcards.com` | link do e-mail de "esqueci a senha" aponta pra cá |
| `PB_DATA_DIR` | `/data/flashcards/pb_data` | caminho no **host** onde o SQLite + imagens ficam (pode manter o default do compose, é só pra deixar explícito) |

> Essas envs precisam estar marcadas como disponíveis para **ambos os serviços**
> (`pocketbase` e `import-worker`) do recurso — no Coolify, envs de um recurso
> "Docker Compose" já ficam visíveis para todos os serviços do compose por padrão,
> então normalmente não precisa fazer nada extra aqui, só confirmar que cadastrou os
> valores uma vez.

### 3.2 Armazenamento persistente (não perder dados a cada deploy)

O `docker-compose.yml` já declara `pb_data` como **bind mount para um caminho fixo do
host** (não um volume nomeado do Compose):

```yaml
volumes:
  - type: bind
    source: ${PB_DATA_DIR:-/data/flashcards/pb_data}
    target: /pb/pb_data
    is_directory: true
```

Isso é proposital: volumes nomeados do Compose já tiveram bugs reportados no Coolify
de serem recriados do zero em certos redeploys. Bind mount pra um caminho fixo do
host não depende de nenhuma lógica interna de nomeação do Coolify — o Coolify só
cria a pasta (`is_directory: true`) na primeira vez e monta sempre o mesmo lugar.

Confira, na aba **Storages** do recurso (o Coolify detecta esse bind mount
automaticamente a partir do compose), que o caminho aparece como
`/data/flashcards/pb_data` → `/pb/pb_data`. Isso é o que garante que o banco SQLite
e as imagens enviadas pelos usuários sobrevivem a builds/redeploys seguintes.

Também recomendado: **Servers → (seu servidor) → Configuration → Docker Cleanup** →
desative **"Delete Unused Volumes"** (ou aumente bastante o intervalo). Já houve bug
relatado desse cleanup apagando volumes que ainda estavam em uso.

> Note que `pb_migrations` e `pb_hooks` **não** são bind mount — eles entram dentro
> da imagem via `COPY` no `backend/Dockerfile`. Isso é o que permite deixar
> **"Preserve Repository During Deployment" desligado** (o padrão): o Coolify não
> precisa manter o checkout do Git vivo depois do build, o que evita outra classe de
> bug do Coolify (erro de volume ao usar essa flag).

### 3.3 Domínio

Aba **Domains** do serviço `pocketbase` dentro do recurso → `https://api.seuflashcards.com`
(porta interna `8090`, já é o que o `expose` no compose define). O Coolify emite o
certificado (Let's Encrypt) automaticamente.

O `import-worker` **não** precisa de domínio — ele só fala com o `pocketbase` pela
rede interna do Compose (`http://pocketbase:8090`).

### 3.4 Primeiro deploy

O `backend/entrypoint.sh` já roda `pocketbase superuser upsert "$PB_ADMIN_EMAIL"
"$PB_ADMIN_PASSWORD"` **antes** de `pocketbase serve`, toda vez que o container
sobe — não precisa mais logar no terminal do container pra criar o superuser à mão.
Isso também resolve o problema de "corrida" do primeiro deploy: como o
`import-worker` só consegue autenticar depois que esse superuser existe, criar sem
depender de um passo manual evita o restart loop dele enquanto você corre pra abrir
o terminal (ver troubleshooting).

Clique **Deploy**. Depois que subir:

1. Acesse `https://api.seuflashcards.com/_/` e entre com o `PB_ADMIN_EMAIL`/
   `PB_ADMIN_PASSWORD` que você cadastrou nas envs do passo 3.1.
2. Configure **Settings → Mail settings** (SMTP — ver
   `docs/02-backend-step-by-step.md` §11). Sem isso o e-mail de "esqueci a senha"
   não é entregue (o endpoint responde OK, mas o envio falha silenciosamente).
3. Rode o smoke test contra a URL pública, se quiser confirmar tudo (precisa do
   `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD` do passo 3.1 — o script usa o superuser pra
   marcar as contas de teste como verificadas, já que `authRule = "verified = true"`
   bloqueia login de conta não confirmada):
   ```bash
   PB_URL=https://api.seuflashcards.com \
   PB_ADMIN_EMAIL=admin@seudominio.com PB_ADMIN_PASSWORD='SenhaForte123!' \
   ./scripts/smoke-test.sh
   ```

✅ **Pronto quando:** `https://api.seuflashcards.com/api/health` responde 200 e o
painel admin abre com o login do passo 1.

---

## 4. Recurso do frontend (SvelteKit estático)

**Project → + New Resource → Application** → **mesmo repo** `flashcards-app` →
build pack **Dockerfile**.

| Campo | Valor |
|---|---|
| Branch | `main` |
| Base Directory | `/web` |
| Dockerfile Location | `Dockerfile` (combinado com a Base Directory acima, vira `/web/Dockerfile` — confira no preview do Coolify) |
| Port (interna) | `80` |
| Automatic deployment (push) | **desligado** (mesma lógica do backend) |

### 4.1 Variáveis de ambiente (build-time!)

O SvelteKit usa `$env/static/public`, que embute os valores **no momento do
`npm run build`** — trocar a env só no runtime do container não muda nada, precisa
rebuildar. No Coolify, ao criar cada uma dessas envs, marque a opção
**"Available at Buildtime"** (além de runtime, se existir a opção):

| Chave | Valor |
|---|---|
| `PUBLIC_PB_URL` | `https://api.seuflashcards.com` |
| `PUBLIC_APP_VERSION` | `v0.1.0` (valor inicial — depois disso quem atualiza sozinho é o workflow do passo 8) |

O `web/Dockerfile` já repassa essas duas como `ARG`/`ENV` pro `npm run build`.

### 4.2 Domínio

Aba **Domains** → `https://app.seuflashcards.com`.

### 4.3 Primeiro deploy

Clique **Deploy**. Depois de subir, abra `https://app.seuflashcards.com`, faça login/
registro e confira o rodapé: deve aparecer "Flashcards v0.1.0".

✅ **Pronto quando:** o site abre, fala com a API (`PUBLIC_PB_URL` certo — teste um
login) e o rodapé mostra a versão.

---

## 5. Sem CORS pra configurar

O PocketBase já vem com política de CORS permissiva por padrão — não precisa liberar
`app.seuflashcards.com` manualmente pra API aceitar as chamadas do frontend.

---

## 6. Gerar o token de API do Coolify

**Coolify → Keys & Tokens → API Tokens** → criar um token novo marcando as
permissões **Deploy** e **Write** (a segunda é usada pra atualizar a env
`PUBLIC_APP_VERSION` a cada release). Guarde o valor — só é mostrado uma vez.

Anote também, de cada recurso (backend e frontend), o **UUID** — aparece na URL do
recurso no painel (`.../application/<uuid>`) ou na aba **Webhooks**/**General**.

---

## 7. Segredos no GitHub

Repositório `flashcards-app` → **Settings → Secrets and variables → Actions → New
repository secret**:

| Secret | Valor |
|---|---|
| `COOLIFY_URL` | `https://coolify.devoluapp.cloud` (sem barra no final) |
| `COOLIFY_TOKEN` | o token do passo 6 |
| `COOLIFY_BACKEND_UUID` | UUID do recurso do backend |
| `COOLIFY_FRONTEND_UUID` | UUID do recurso do frontend |

Um único workflow (`.github/workflows/deploy.yml`, na raiz do repo) usa os quatro.

---

## 8. Como funciona o deploy por tag semver

O workflow só dispara quando você empurra uma tag no formato `vX.Y.Z`. Um push comum
na branch `main` **não** dispara nada — é por isso que desligamos o "Automatic
deployment" nativo do Coolify nos passos 3 e 4: a única porta de entrada pro deploy
é a tag.

Fluxo de release:

```bash
git checkout main
git pull
# ... seus commits normais, merge de PRs, etc. (sem deploy nenhum acontecendo) ...

git tag v1.4.0
git push origin v1.4.0
```

O que acontece:

1. GitHub Actions detecta o push da tag `v1.4.0`.
2. Primeiro faz `PATCH` na env `PUBLIC_APP_VERSION` do recurso do frontend no
   Coolify pra `v1.4.0` (usa `github.ref_name`, o nome exato da tag).
3. Chama `POST /api/v1/deploy?uuid=<backend>,<frontend>` do Coolify (endpoint
   oficial da API, aceita as duas UUIDs separadas por vírgula numa chamada só) —
   isso builda e sobe backend e frontend juntos, na mesma release, pegando a versão
   mais recente da branch configurada (que, no fluxo normal de "mergeei tudo pra
   main e agora crio a tag", é exatamente o commit que a tag aponta).
4. No frontend, esse build já sai com `PUBLIC_APP_VERSION=v1.4.0` embutido — o
   rodapé do site passa a mostrar "Flashcards v1.4.0".

Quer testar sem esperar um release de verdade? Crie uma tag de teste:
```bash
git tag v0.1.1 && git push origin v0.1.1
```
e acompanhe em **GitHub → Actions** (o job rodando) e no Coolify (**Deployments**,
aba de cada recurso) os dois builds acontecendo.

Pra remover uma tag de teste depois: `git push --delete origin v0.1.1 && git tag -d v0.1.1`.

---

## 9. Backup dos dados

`pb_data` (banco SQLite + imagens enviadas) mora agora num caminho fixo do host
(`/data/flashcards/pb_data`, ou o que você definiu em `PB_DATA_DIR`). Duas camadas,
já que é a única fonte de verdade do produto:

1. **Backup nativo do PocketBase** (recomendado, já documentado em
   `docs/02-backend-step-by-step.md` §12): painel admin → `Settings → Backups`,
   backup automático enviado pra um S3-compatível (R2, etc.).
2. **Defesa extra, direto no host** (porque agora é só uma pasta normal, sem
   depender de `docker volume`):
   ```bash
   tar -czf "flashcards-pb_data-$(date +%F).tar.gz" -C /data/flashcards pb_data
   ```
   Rode isso num cron do próprio servidor (ou como **Scheduled Task** do recurso, se
   preferir manter tudo dentro do Coolify), e mande o `.tar.gz` pra fora da VPS.

---

## 10. Checklist final

- [ ] Repositório `flashcards-app` criado no GitHub e com o push inicial.
- [ ] Deploy key cadastrada no Coolify (uma só, reaproveitada nos dois recursos).
- [ ] Recurso do backend: `Application` + build pack `Docker Compose`, Base Directory
      `/`, envs (`PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`, `PB_FRONTEND_URL`), domínio
      `api.seuflashcards.com`, "Automatic deployment" desligado.
- [ ] Storages do backend mostrando o bind mount de `pb_data` no caminho certo.
- [ ] "Delete Unused Volumes" desligado nas configs do servidor.
- [ ] Login no painel admin do PocketBase com `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD`
      testado (superuser é criado sozinho no boot, via `backend/entrypoint.sh`) +
      SMTP configurado no painel admin.
- [ ] Recurso do frontend: `Application` + build pack `Dockerfile`, Base Directory
      `/web`, envs `PUBLIC_PB_URL`/`PUBLIC_APP_VERSION` marcadas **buildtime**,
      domínio `app.seuflashcards.com`, "Automatic deployment" desligado.
- [ ] Token de API do Coolify gerado (permissões Deploy + Write).
- [ ] Secrets `COOLIFY_URL`, `COOLIFY_TOKEN`, `COOLIFY_BACKEND_UUID`,
      `COOLIFY_FRONTEND_UUID` cadastrados no repo no GitHub.
- [ ] Testado: `git tag vX.Y.Z && git push origin vX.Y.Z` dispara o deploy dos dois
      recursos e a versão aparece no rodapé do site.
- [ ] Backup do PocketBase configurado (S3) + cron de tar do host como reforço.

---

## Apêndice — Troubleshooting

- **Build falha com "no such file or directory" em algo tipo `COPY pb_migrations`.**
  Confirme que o recurso foi criado a partir de um card **Git** com **Build Pack =
  "Docker Compose"** (não a partir do card **"Docker Compose Empty"**) e que a
  `Docker Compose Location` aponta pro `docker-compose.yml` certo do repo clonado.
- **`import-worker` fica em loop de `ClientResponseError 400: Failed to
  authenticate.` no primeiro deploy, o Coolify para tudo antes de dar tempo de
  criar o superuser.** Era o comportamento antigo (superuser só existia depois de
  um passo manual, e o worker morria com `process.exit(1)` na primeira falha de
  auth). Já corrigido em duas frentes — confirme que seu checkout tem as duas:
  - `backend/entrypoint.sh` roda `pocketbase superuser upsert` no boot (idempotente,
    usa `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD`), então o superuser já existe antes do
    `import-worker` tentar autenticar.
  - `import-worker/src/index.ts` tenta autenticar com retry/backoff em vez de
    encerrar o processo na primeira falha — então mesmo numa inicialização lenta do
    `pocketbase` ele não entra em crash loop.
  Se ainda falhar depois disso, confira se `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD`
  batem exatamente entre os dois serviços (são as mesmas envs do passo 3.1) e se a
  senha tem pelo menos 8 caracteres (mínimo exigido pelo PocketBase para superuser).
- **Build do frontend falha achando `package.json` ou `Dockerfile`.** Confira a
  `Base Directory` do recurso do frontend — precisa ser `/web` (o Dockerfile e o
  `package.json` do SvelteKit estão dentro dessa pasta, não na raiz do repo).
- **Depois de um redeploy, os dados (decks/cards) sumiram.** Veja a aba **Storages**
  do recurso do backend — confirme que o bind mount de `pb_data` ainda aponta pro
  mesmo caminho do host de sempre. Se em algum momento você trocou `PB_DATA_DIR`, os
  dados antigos continuam no caminho anterior (não some, só "muda de gaveta").
- **E-mail de "esqueci a senha" nunca chega.** Confira `Settings → Mail settings` no
  painel do PocketBase (`/_/`) — sem SMTP configurado lá, o envio falha em silêncio
  (o endpoint da API sempre responde sucesso, por design anti-enumeração de e-mails).
- **O rodapé do site mostra "dev" em vez da versão.** `PUBLIC_APP_VERSION` não estava
  marcada como **buildtime** no Coolify, ou o workflow do GitHub Actions não rodou
  (confira a aba Actions do repo na tag que você empurrou).
- **Push normal na `main` disparou um deploy sem eu querer.** Confira, nos dois
  recursos, se "Automatic deployment" / o webhook de push do Coolify está mesmo
  desligado — só o workflow de tag deve chamar `/api/v1/deploy`.
