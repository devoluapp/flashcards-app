# Flashcards — Backend (PocketBase v0.39.7)

Backend único e sincronizável para um app de flashcards com **FSRS**. Multiusuário, upload de imagem com proporção/limite e importação em lote (Anki/Quizlet/CSV). Frontend atual: **Android nativo (Kotlin)**. O frontend web tem projeto próprio em `docs/03-web-frontend-build.md`.

## Conteúdo do repositório

```
docs/
  01-backend-spec.md          # especificação completa (o "porquê" e o "o quê")
  02-backend-step-by-step.md   # guia passo a passo para subir no Coolify
  03-web-frontend-build.md     # projeto do frontend web (fase futura)
docker-compose.yml             # PocketBase + Import Worker (deploy Coolify)
docker-compose-local.yml       # mesma stack, mas com porta exposta p/ localhost (uso local)
scripts/smoke-test.sh          # smoke test de integração cobrindo hooks/regras/import
backend/
  Dockerfile                   # baixa o PocketBase v0.39.7 e embute pb_migrations/pb_hooks na imagem
  pb_migrations/               # schema versionado (sintaxe JSVM v0.23+)
  pb_hooks/main.pb.js          # quota/validação/regras de negócio
import-worker/                 # serviço Node que processa importações
```

Deploy em produção (Coolify, backend + frontend web, releases por tag semver): ver `../DEPLOY-COOLIFY.md` (raiz do monorepo).

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
   docker compose -f docker-compose-local.yml exec pocketbase \
     /pb/pocketbase superuser upsert admin@local.dev 'SenhaLocal123!'
   docker compose -f docker-compose-local.yml up -d --build import-worker
   ```
4. Teste: `./scripts/smoke-test.sh` (integração, via REST real) e `cd import-worker && npm test` (unitário, parsers csv/quizlet/anki). Veja `docs/02-backend-step-by-step.md` §4.1 para detalhes.

## Avisos importantes

- **Versão:** os snippets usam a API **JSVM v0.23+** (a sua v0.39.7). Confira em https://pocketbase.io/jsvm/ se algo mudou.
- **Segredos** (admin do PocketBase, SMTP, S3) vão nas variáveis de ambiente do Coolify — nunca no repositório.
- As migrations são **ilustrativas/prontas para revisão**: valide-as rodando localmente antes do deploy (a validação da v0.23+ é rígida).
