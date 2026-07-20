# Guia passo a passo — Backend Flashcards (PocketBase v0.39.7)

Orientação completa para levar o backend do zero ao ar, no seu Coolify. Feito para ser executado com o **Claude Code** aberto neste diretório. Cada passo tem um **objetivo**, os **comandos/ações** e um **critério de pronto ✅**.

Sumário: 0) pré-requisitos · 1) rodar local · 2) criar admin · 3) validar migrations · 4) testar API/auth · 5) FSRS end-to-end · 6) imagens · 7) importação · 8) worker · 9) deploy no Coolify · 10) domínio/HTTPS · 11) SMTP · 12) backups · 13) hardening · 14) checklist final.

---

## 0. Pré-requisitos

- PocketBase **v0.39.7** (você já tem). Confirme: `./pocketbase --version`.
- Node 22+ (para o Import Worker) e Git.
- Acesso ao seu Coolify (`https://coolify.devoluapp.cloud`).
- Este repositório (`flashcards-app/`, monorepo com backend + `web/`) versionado no Git, num remoto que o Coolify consiga puxar (ver `../DEPLOY-COOLIFY.md`).

✅ **Pronto quando:** `./pocketbase --version` mostra 0.39.7 e você consegue commitar/puxar o repo.

---

## 1. Rodar o PocketBase local (com as migrations e hooks)

Objetivo: validar tudo na sua máquina antes de tocar na VPS.

```bash
cd flashcards-app
./pocketbase serve \
  --dir=./backend/pb_data \
  --migrationsDir=./backend/pb_migrations \
  --hooksDir=./backend/pb_hooks
```

- Ao subir, o PocketBase **aplica as migrations** de `backend/pb_migrations/` em ordem.
- Painel admin: `http://127.0.0.1:8090/_/`.

✅ **Pronto quando:** o servidor sobe **sem erro de migration** e o painel abre.

> Se der erro de validação numa migration (a v0.23+ valida por padrão), leia a mensagem: quase sempre é ordem de criação (uma relação apontando para coleção ainda não criada) ou nome de propriedade de campo. Ajuste e reinicie.

---

## 2. Criar o superusuário (admin)

Na v0.23+ o admin fica na coleção `_superusers`.

```bash
./pocketbase superuser create voce@exemplo.com UMA_SENHA_FORTE
```

Entre no painel `/_/` com essas credenciais.

✅ **Pronto quando:** você loga no painel e vê as coleções `users`, `decks`, `cards`, `review_logs`, `import_jobs`.

---

## 3. Validar o schema (migrations)

No painel, confira cada coleção:

- `users` tem os campos extra: `desired_retention`, `fsrs_params`, `timezone`, `plan`, `storage_used`, `settings`, `avatar`.
- `cards` tem o bloco FSRS (`state`, `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `last_review`, `suspended`) + `front_image`/`back_image` como **file (image)** com thumbs.
- `review_logs` está com **update/delete desabilitados** (imutável).
- As **API Rules** de todas as coleções de dados são privadas por usuário.

✅ **Pronto quando:** o schema bate com `docs/01-backend-spec.md` §4.

> Dica: depois de acertar o schema pelo painel, você pode **exportar as migrations** atualizadas (Settings → Export collections / ou o próprio PB gera `pb_migrations`) e commitá-las, garantindo reprodutibilidade no deploy.

---

## 4. Testar auth e CRUD pela API

Crie um usuário de teste e um deck via REST (ajuste a URL):

```bash
# criar usuário
curl -X POST http://127.0.0.1:8090/api/collections/users/records \
  -H "Content-Type: application/json" \
  -d '{"email":"aluno@teste.com","password":"12345678","passwordConfirm":"12345678","name":"Aluno","plan":"free","desired_retention":0.9}'

# autenticar
curl -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"aluno@teste.com","password":"12345678"}'
# -> guarde o "token" retornado

# criar deck (usando o token)
curl -X POST http://127.0.0.1:8090/api/collections/decks/records \
  -H "Authorization: TOKEN_AQUI" -H "Content-Type: application/json" \
  -d '{"name":"Direito Constitucional"}'
```

O hook `forceOwner` preenche `user` automaticamente com o dono autenticado.

✅ **Pronto quando:** você cria deck/card autenticado, e **não** consegue ver dados de outro usuário.

### 4.1 Testando todos os endpoints de uma vez (smoke test)

O backend não tem rotas custom além do REST genérico do PocketBase (gerado a partir das
coleções em `backend/pb_migrations/`) mais os hooks de negócio em `backend/pb_hooks/main.pb.js`.
Ou seja, "todos os endpoints" = CRUD de `users`/`decks`/`cards`/`review_logs`/`import_jobs`
mais os efeitos dos hooks. Duas formas de explorar/testar isso:

- **Manual, exploratório:** no painel `/_/`, cada coleção tem uma aba **API Preview** que já
  mostra o formato exato de request/response e permite testar ali mesmo — útil para inspecionar
  uma coleção específica sem escrever nada.
- **Automatizado:** `./scripts/smoke-test.sh` (bash + curl + jq, sem dependências extras) sobe
  dois usuários e cobre, via REST real, cada regra de negócio implementada nos hooks e nas
  migrations:
  - `forceOwner` preenche `user` e ignora tentativa de spoof;
  - cota de decks do plano free (3 decks; o 4º é bloqueado);
  - estado FSRS default de um card novo (`state=new`, `reps=0`, ...);
  - privacidade entre usuários (listagem/visualização não vazam dados de outro dono);
  - imutabilidade de `review_logs` (PATCH/DELETE devem dar 403);
  - limite de tamanho de imagem em `front_image` (2 MB);
  - a query da fila FSRS (`due <= @now`);
  - o fluxo completo de `import_jobs` (CSV) processado pelo Import Worker.

  Rode com o PocketBase local de pé (`docker-compose-local.yml` ou o binário):
  ```bash
  PB_URL=http://localhost:8090 ./scripts/smoke-test.sh
  ```
  Ele não precisa de credenciais de superusuário — só cria/autentica usuários normais via API.

### 4.2 Testes unitários (Import Worker)

Os parsers de importação (`import-worker/src/parsers/{csv,quizlet,anki}.ts`) são funções puras
e têm testes unitários com Vitest — não precisam do PocketBase rodando:

```bash
cd import-worker
npm install
npm test
```

Cobrem os casos de borda de cada parser (colunas customizadas, linhas sem separador/campo
vazio, `.apkg` anki2 vs. anki21, detecção do formato novo `anki21b`, etc.). Os hooks de negócio
em `pb_hooks/main.pb.js`, por serem JS rodando dentro do PocketBase (JSVM), não têm um harness
de teste unitário oficial — são cobertos pelo smoke test da seção 4.1, que os exercita de ponta
a ponta via API real.

---

## 5. FSRS end-to-end (validação da lógica)

Como o agendamento roda no cliente, valide a ida-e-volta:

1. Crie um card (nasce `state=new`).
2. Simule uma revisão: calcule com uma lib FSRS (no app Kotlin será `FSRS-Kotlin`; para teste rápido dá para usar `ts-fsrs` num script Node) o novo estado para a nota **Good**.
3. `PATCH` no card com o novo estado + `POST` em `review_logs`.
4. Rode a query da fila do dia:
   ```
   GET /api/collections/cards/records?filter=(due <= @now && suspended = false && deleted = false)&sort=due
   ```

✅ **Pronto quando:** o `due` do card avança corretamente e o `review_log` fica gravado e imutável.

---

## 6. Upload de imagem (proporção + tamanho)

1. No app/cliente, faça **crop 4:3** e resize (lado ≤ 1024 px, WebP) **antes** do upload.
2. Suba a imagem no campo `front_image` (multipart/form-data).
3. Recupere o thumb: `GET /api/files/cards/{id}/{arquivo}?thumb=400x300f`.
4. Teste os limites: um arquivo > 2 MB deve ser **rejeitado**; um usuário `free` acima da cota deve receber o erro do hook.

✅ **Pronto quando:** upload dentro do limite funciona, thumb responde, e os limites/cota bloqueiam corretamente.

---

## 7. Importação (CSV → Quizlet → Anki)

Suba um `import_jobs` com um arquivo e acompanhe o `status`.

```bash
# exemplo CSV
curl -X POST http://127.0.0.1:8090/api/collections/import_jobs/records \
  -H "Authorization: TOKEN_AQUI" \
  -F "user=USER_ID" -F "type=csv" -F "file=@meus_cards.csv" \
  -F 'options={"frontCol":"front","backCol":"back","tagsCol":"tags"}'
```

Ordem recomendada de implementação/teste: **CSV** (mais simples) → **Quizlet** (texto delimitado) → **Anki `.apkg`** (`anki2`/`anki21`; `anki21b` retorna erro amigável).

✅ **Pronto quando:** o job vira `done` e os cards aparecem no deck de destino.

---

## 8. Subir e testar o Import Worker

```bash
cd import-worker
npm install
PB_URL=http://127.0.0.1:8090 \
PB_ADMIN_EMAIL=voce@exemplo.com PB_ADMIN_PASSWORD=SENHA \
npm run dev
```

O worker autentica como `_superusers`, processa os `pending` e escuta novos em tempo real.

✅ **Pronto quando:** ao criar um `import_jobs`, o worker loga o processamento e os cards são criados.

---

## 9. Deploy no Coolify

> ⚠️ **Não** use "+ Add Resource → Service → Docker Compose Empty" colando o
> conteúdo do `docker-compose.yml` — esse tipo de recurso não tem acesso ao
> código-fonte do repo, então os `build: context: ./backend` falham por falta de
> contexto (foi exatamente esse o erro na primeira tentativa deste projeto). O
> passo a passo certo, completo e testado — incluindo a env `PB_ADMIN_EMAIL`/
> `PB_ADMIN_PASSWORD`, o build arg `PB_VERSION`, armazenamento persistente e o
> deploy automático a cada push via webhook — está em `../DEPLOY-COOLIFY.md` §3.

✅ **Pronto quando:** os dois containers ficam `running` e o log do PocketBase mostra as migrations aplicadas.

---

## 10. Domínio e HTTPS

1. Aponte um subdomínio (ex.: `api.seuflashcards.com`) para a VPS.
2. No Coolify, associe o domínio ao serviço `pocketbase` (porta interna **8090**). O Coolify emite o certificado (Let's Encrypt).
3. Acesse `https://api.seuflashcards.com/_/`.

✅ **Pronto quando:** o painel abre por HTTPS no seu domínio.

---

## 11. E-mail (SMTP)

No painel `Settings → Mail settings`, configure um SMTP (ex.: seu **Usesend**, ou Resend/Brevo). **Obrigatório** — desde a migration `1721300600_require_email_verification.js`, a conta só consegue autenticar depois de confirmar o e-mail (`authRule = "verified = true"` na coleção `users`), então sem SMTP configurado ninguém consegue criar conta nova.

Defina também a env `PB_FRONTEND_URL` (no `docker-compose.yml`/Coolify) com a URL pública do frontend web, ex. `https://app.seuflashcards.com`. A migration `1721300500_reset_password_email.js` usa essa env para montar o link do e-mail de "esqueci a senha" apontando para `/reset-password?token=...` no frontend, em vez da UI admin do PocketBase. Sem a env, o link cai para `http://localhost:5173` (uso local).

✅ **Pronto quando:** o e-mail de teste do painel chega, e `POST /api/collections/users/request-password-reset` (fluxo "Esqueci a senha" do frontend) chega com o link correto.

---

## 12. Backups

`Settings → Backups`: ative backups automáticos e, de preferência, envie para um **S3-compatível** (R2, ou Garage/SeaweedFS do seu catálogo Coolify). É a fonte da verdade — não pule.

✅ **Pronto quando:** existe um backup recente e você testou restaurar num ambiente separado.

---

## 13. Hardening (segurança)

- Ative o **rate limiter** nativo (Settings) para rotas de auth e criação.
- Revise as **API Rules** (nada público por engano).
- ~~Habilite verificação de e-mail obrigatória~~ — feito nas migrations
  `1721300600_require_email_verification.js` (`authRule = "verified = true"` na
  coleção `users` + e-mail de confirmação apontando para `/verify-email` no
  frontend) e
  `1721300700_require_verified_for_data_access.js` (`@request.auth.verified = true`
  nas API Rules de `decks`/`cards`/`review_logs`/`import_jobs`, pra um token emitido
  antes da conta virar não-verificada também parar de funcionar).
- Cron de **purga** de registros `deleted=true` antigos (hook `cronAdd`).
- Guarde os segredos só no Coolify.

✅ **Pronto quando:** rate limit ativo, rules revisadas, e um cron de limpeza agendado.

> **Contas que já existiam antes dessa migration** ficam com `verified=false` e
> deixam de conseguir logar até confirmar o e-mail (ou pedir reenvio pela tela de
> login). Se precisar liberar alguma manualmente (ex.: sua própria conta de teste),
> dá pra marcar `verified` como `true` direto no painel admin (`/_/` → coleção
> `users` → abrir o registro → campo `verified`).

---

## 14. Checklist final (backend pronto para o app Android)

- [ ] Migrations aplicadas e schema conferido.
- [ ] Auth (registro/login/verificação) funcionando por HTTPS.
- [ ] CRUD de decks/cards privado por usuário.
- [ ] Ciclo FSRS (revisar → atualizar card → gravar log) validado.
- [ ] Upload de imagem com crop/limite + thumbs.
- [ ] Importação CSV/Quizlet/Anki via worker.
- [ ] Realtime (subscribe) funcionando para sync.
- [ ] Backups + rate limit + SMTP ok.

Com isso, o app **Android (Kotlin)** só precisa consumir a API: auth, sincronizar `decks`/`cards`, rodar o **FSRS-Kotlin** localmente na revisão, e enviar `cards`+`review_logs` de volta.

---

## Próximos passos sugeridos
- Endpoint/rotina de **otimização dos pesos FSRS** por usuário (cron no worker com `py-fsrs`), quando houver histórico.
- Coleção `public_decks` para vender/compartilhar decks prontos (o fosso de conteúdo).
- Métricas de estudo (retenção real vs. alvo, carga futura) para a tela de estatísticas.
