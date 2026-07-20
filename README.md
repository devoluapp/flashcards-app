# Flashcards (monorepo: backend + frontend web)

Backend único e sincronizável para um app de flashcards com **FSRS** (PocketBase),
mais o **frontend web** (SvelteKit) que o consome. Multiusuário, upload de imagem
com proporção/limite e importação em lote (Anki/Quizlet/CSV). Existe também um
**app Android nativo (Kotlin)**, que vive em repositório próprio, isolado deste
(não depende de nada aqui além de falar com a mesma API).

## Conteúdo do repositório

```
docs/
  01-backend-spec.md          # especificação completa (o "porquê" e o "o quê")
  02-backend-step-by-step.md   # guia passo a passo do backend (SMTP, backups, hardening)
  03-web-frontend-build.md     # projeto original do frontend web (histórico — hoje é web/)
docker-compose.yml             # PocketBase + Import Worker (deploy Coolify)
docker-compose-local.yml       # mesma stack, mas com porta exposta p/ localhost (uso local)
scripts/smoke-test.sh          # smoke test de integração cobrindo hooks/regras/import
backend/
  Dockerfile                   # baixa o PocketBase v0.39.7 e embute pb_migrations/pb_hooks na imagem
  pb_migrations/               # schema versionado (sintaxe JSVM v0.23+)
  pb_hooks/main.pb.js          # quota/validação/regras de negócio
import-worker/                 # serviço Node que processa importações
web/                            # frontend SvelteKit (SPA estático + nginx, ver web/README.md)
```

Deploy em produção (Coolify, backend + frontend web, deploy automático a cada push
na `main` via webhook): ver `DEPLOY-COOLIFY.md`, na raiz deste mesmo repositório.

## Começe por aqui

1. Leia `docs/01-backend-spec.md` (visão geral, modelo de dados, FSRS).
2. Siga `docs/02-backend-step-by-step.md` para subir no Coolify.
3. Rode local antes do deploy (duas opções):
   ```bash
   # Opção A — binário local (precisa baixar o pocketbase manualmente antes, ver docs/02 §0)
   ./pocketbase serve --dir=./backend/pb_data \
     --migrationsDir=./backend/pb_migrations --hooksDir=./backend/pb_hooks
   cd import-worker && npm install && npm run dev

   # Opção B — Docker (build igual ao deploy, porta 8090 exposta no host)
   docker compose -f docker-compose-local.yml up -d --build pocketbase
   # entrypoint.sh já garante o superuser admin@local.dev/SenhaLocal123! sozinho no
   # boot — só rode o upsert manual abaixo se quiser outro e-mail/senha localmente.
   # docker compose -f docker-compose-local.yml exec pocketbase \
   #   /pb/pocketbase superuser upsert admin@local.dev 'SenhaLocal123!'
   docker compose -f docker-compose-local.yml up -d --build import-worker
   ```
4. Teste: `PB_ADMIN_EMAIL=admin@local.dev PB_ADMIN_PASSWORD='SenhaLocal123!' ./scripts/smoke-test.sh`
   (integração, via REST real — usa o superuser do passo 3 pra marcar as contas de
   teste como verificadas, já que `authRule = "verified = true"` bloqueia login de
   conta não confirmada) e `cd import-worker && npm test` (unitário, parsers
   csv/quizlet/anki). Veja `docs/02-backend-step-by-step.md` §4.1 para detalhes.

## Avisos importantes

- **Versão:** os snippets usam a API **JSVM v0.23+** (a sua v0.39.7). Confira em https://pocketbase.io/jsvm/ se algo mudou.
- **Segredos** (admin do PocketBase, SMTP, S3) vão nas variáveis de ambiente do Coolify — nunca no repositório.
- As migrations são **ilustrativas/prontas para revisão**: valide-as rodando localmente antes do deploy (a validação da v0.23+ é rígida).
