#!/usr/bin/env bash
# Smoke test de integração para o backend PocketBase (flashcards).
# Roda contra um PocketBase LOCAL já de pé (ver docker-compose-local.yml) e cobre,
# via REST real, as regras de negócio implementadas em backend/pb_hooks e
# backend/pb_migrations: dono automático, cota de decks do plano free, estado FSRS
# default de cards, privacidade entre usuários, imutabilidade de review_logs,
# limite de tamanho de imagem, o fluxo de "esqueci a senha" (anti-enumeração)
# e o fluxo de import_jobs processado pelo worker.
#
# Uso: PB_URL=http://localhost:8090 PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... ./scripts/smoke-test.sh
# Requer: curl, jq. Desde 1721300600_require_email_verification.js (authRule =
# "verified = true" na coleção users), contas novas não conseguem logar sem
# confirmar o e-mail — como o teste não tem como ler a caixa de entrada, ele usa
# o superuser (mesmas envs do import-worker/backend/entrypoint.sh) pra marcar as
# contas de teste como verified=true na mão.
set -uo pipefail

PB_URL="${PB_URL:-http://localhost:8090}"
: "${PB_ADMIN_EMAIL:?defina PB_ADMIN_EMAIL (superuser) — necessário pra verificar as contas de teste}"
: "${PB_ADMIN_PASSWORD:?defina PB_ADMIN_PASSWORD (superuser) — necessário pra verificar as contas de teste}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STAMP="$(date +%s)"
PASS=0
FAIL=0

log()  { printf '\033[36m▸ %s\033[0m\n' "$1"; }
ok()   { PASS=$((PASS+1)); printf '  \033[32m✓ %s\033[0m\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗ %s\033[0m\n' "$1"; }

# faz a requisição, salva corpo em $TMP/body, devolve o status HTTP em stdout
req() {
  local method="$1" path="$2" data="${3:-}" token="${4:-}"
  local args=(-sS -o "$TMP/body" -w '%{http_code}' -X "$method" "$PB_URL$path" -H "Content-Type: application/json")
  [ -n "$token" ] && args+=(-H "Authorization: $token")
  [ -n "$data" ] && args+=(-d "$data")
  curl "${args[@]}"
}

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then ok "$desc"; else
    bad "$desc (esperado $expected, veio $actual — corpo: $(cat "$TMP/body" 2>/dev/null | head -c 300))"
  fi
}

# ---------------------------------------------------------------------------
log "0) health check"
code=$(req GET /api/health)
assert_eq "GET /api/health -> 200" 200 "$code"

# ---------------------------------------------------------------------------
log "1) registro e autenticação de dois usuários (A e B)"
EMAIL_A="a.$STAMP@teste.dev"; EMAIL_B="b.$STAMP@teste.dev"; PASS_="Senha123!"

code=$(req POST /api/collections/users/records "{\"email\":\"$EMAIL_A\",\"password\":\"$PASS_\",\"passwordConfirm\":\"$PASS_\",\"name\":\"Usuário A\",\"plan\":\"free\",\"desired_retention\":0.9}")
assert_eq "registro do usuário A -> 200" 200 "$code"
USER_A_ID=$(jq -r .id "$TMP/body")

code=$(req POST /api/collections/users/records "{\"email\":\"$EMAIL_B\",\"password\":\"$PASS_\",\"passwordConfirm\":\"$PASS_\",\"name\":\"Usuário B\",\"plan\":\"free\",\"desired_retention\":0.9}")
assert_eq "registro do usuário B -> 200" 200 "$code"
USER_B_ID=$(jq -r .id "$TMP/body")

code=$(req POST /api/collections/_superusers/auth-with-password "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASSWORD\"}")
assert_eq "login do superuser -> 200" 200 "$code"
SUPER_TOKEN=$(jq -r .token "$TMP/body")

code=$(req PATCH "/api/collections/users/records/$USER_A_ID" '{"verified":true}' "$SUPER_TOKEN")
assert_eq "marcar usuário A como verificado (authRule exige verified=true) -> 200" 200 "$code"

code=$(req PATCH "/api/collections/users/records/$USER_B_ID" '{"verified":true}' "$SUPER_TOKEN")
assert_eq "marcar usuário B como verificado (authRule exige verified=true) -> 200" 200 "$code"

code=$(req POST /api/collections/users/auth-with-password "{\"identity\":\"$EMAIL_A\",\"password\":\"$PASS_\"}")
assert_eq "login do usuário A -> 200" 200 "$code"
TOKEN_A=$(jq -r .token "$TMP/body"); USER_A=$(jq -r .record.id "$TMP/body")

code=$(req POST /api/collections/users/auth-with-password "{\"identity\":\"$EMAIL_B\",\"password\":\"$PASS_\"}")
assert_eq "login do usuário B -> 200" 200 "$code"
TOKEN_B=$(jq -r .token "$TMP/body"); USER_B=$(jq -r .record.id "$TMP/body")

# ---------------------------------------------------------------------------
log "2) hook forceOwner: 'user' é sempre o dono autenticado, mesmo tentando spoofar"
code=$(req POST /api/collections/decks/records "{\"name\":\"Deck spoof\",\"user\":\"$USER_B\"}" "$TOKEN_A")
assert_eq "criar deck autenticado como A tentando setar user=B -> 200" 200 "$code"
owner=$(jq -r .user "$TMP/body")
if [ "$owner" = "$USER_A" ]; then ok "forceOwner ignorou o spoof e gravou user=A"; else bad "forceOwner falhou: user gravado = $owner"; fi
DECK_SPOOF=$(jq -r .id "$TMP/body")

# ---------------------------------------------------------------------------
log "3) cota do plano free: até 3 decks, o 4º deve ser bloqueado"
for i in 1 2; do
  code=$(req POST /api/collections/decks/records "{\"name\":\"Deck $i\"}" "$TOKEN_A")
  assert_eq "criar deck $i/3 (A já tem 1 do passo anterior) -> 200" 200 "$code"
done
code=$(req POST /api/collections/decks/records "{\"name\":\"Deck extra\"}" "$TOKEN_A")
assert_eq "criar 4º deck do plano free -> 400 (cota)" 400 "$code"
DECK_A=$DECK_SPOOF

# ---------------------------------------------------------------------------
log "4) card novo recebe estado FSRS default (hook #4)"
code=$(req POST /api/collections/cards/records "{\"deck\":\"$DECK_A\",\"front\":\"Pergunta\",\"back\":\"Resposta\"}" "$TOKEN_A")
assert_eq "criar card sem state -> 200" 200 "$code"
CARD_A=$(jq -r .id "$TMP/body")
state=$(jq -r .state "$TMP/body"); reps=$(jq -r .reps "$TMP/body")
if [ "$state" = "new" ] && [ "$reps" = "0" ]; then ok "state=new, reps=0 aplicados automaticamente"; else bad "estado FSRS default não aplicado (state=$state reps=$reps)"; fi

# ---------------------------------------------------------------------------
log "5) privacidade entre usuários (API Rules por dono)"
code=$(req GET "/api/collections/decks/records/$DECK_A" "" "$TOKEN_B")
assert_eq "B tenta ver deck de A -> 404" 404 "$code"

code=$(req GET "/api/collections/decks/records" "" "$TOKEN_B")
count_b=$(jq -r '.items | length' "$TMP/body" 2>/dev/null || echo -1)
assert_eq "B lista decks (não deve conter nenhum de A) -> 200" 200 "$code"
[ "$count_b" = "0" ] && ok "listagem de B não vaza decks de A" || bad "listagem de B trouxe $count_b registros (esperado 0)"

# ---------------------------------------------------------------------------
log "6) imutabilidade de review_logs"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
code=$(req POST /api/collections/review_logs/records "{\"card\":\"$CARD_A\",\"rating\":3,\"review\":\"$NOW\"}" "$TOKEN_A")
assert_eq "criar review_log -> 200" 200 "$code"
LOG_A=$(jq -r .id "$TMP/body")

code=$(req PATCH "/api/collections/review_logs/records/$LOG_A" '{"rating":4}' "$TOKEN_A")
assert_eq "PATCH em review_log -> 403 (imutável)" 403 "$code"

code=$(req DELETE "/api/collections/review_logs/records/$LOG_A" "" "$TOKEN_A")
assert_eq "DELETE em review_log -> 403 (imutável)" 403 "$code"

# ---------------------------------------------------------------------------
log "7) limite de tamanho de imagem em cards (front_image, max 2MB)"
head -c 1000000 /dev/urandom > "$TMP/small.bin"
printf '\x89PNG\r\n\x1a\n' | cat - "$TMP/small.bin" > "$TMP/small.png"   # ~1MB, sniffa como PNG
head -c 3000000 /dev/urandom > "$TMP/big.bin"
printf '\x89PNG\r\n\x1a\n' | cat - "$TMP/big.bin" > "$TMP/big.png"      # ~3MB, sniffa como PNG

code=$(curl -sS -o "$TMP/body" -w '%{http_code}' -X POST "$PB_URL/api/collections/cards/records" \
  -H "Authorization: $TOKEN_A" \
  -F "deck=$DECK_A" -F "front=Com imagem" -F "back=Resposta" \
  -F "front_image=@$TMP/small.png;type=image/png")
assert_eq "upload de imagem <=2MB -> 200" 200 "$code"

code=$(curl -sS -o "$TMP/body" -w '%{http_code}' -X POST "$PB_URL/api/collections/cards/records" \
  -H "Authorization: $TOKEN_A" \
  -F "deck=$DECK_A" -F "front=Com imagem grande" -F "back=Resposta" \
  -F "front_image=@$TMP/big.png;type=image/png")
assert_eq "upload de imagem >2MB -> 400 (rejeitado)" 400 "$code"

# ---------------------------------------------------------------------------
log "8) fila FSRS (due <= @now)"
code=$(req GET "/api/collections/cards/records?filter=(due<=%40now%20%26%26%20suspended%3Dfalse%20%26%26%20deleted%3Dfalse)&sort=due" "" "$TOKEN_A")
assert_eq "GET fila de revisão -> 200" 200 "$code"

# ---------------------------------------------------------------------------
log "9) esqueci a senha: sempre 204, com ou sem e-mail cadastrado (anti-enumeração)"
code=$(req POST /api/collections/users/request-password-reset "{\"email\":\"$EMAIL_A\"}")
assert_eq "request-password-reset com e-mail existente -> 204" 204 "$code"

code=$(req POST /api/collections/users/request-password-reset "{\"email\":\"nao-existe.$STAMP@teste.dev\"}")
assert_eq "request-password-reset com e-mail inexistente -> 204" 204 "$code"

# ---------------------------------------------------------------------------
log "10) import_jobs (CSV) processado pelo worker"
FIXTURE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fixtures/sample.csv"
code=$(curl -sS -o "$TMP/body" -w '%{http_code}' -X POST "$PB_URL/api/collections/import_jobs/records" \
  -H "Authorization: $TOKEN_A" \
  -F "type=csv" -F "target_deck=$DECK_A" \
  -F 'options={"frontCol":"front","backCol":"back","tagsCol":"tags"}' \
  -F "file=@$FIXTURE;type=text/csv")
assert_eq "criar import_job csv -> 200" 200 "$code"
JOB_A=$(jq -r .id "$TMP/body")

status="pending"
for _ in $(seq 1 20); do
  code=$(req GET "/api/collections/import_jobs/records/$JOB_A" "" "$TOKEN_A")
  status=$(jq -r .status "$TMP/body")
  [ "$status" = "done" ] || [ "$status" = "error" ] && break
  sleep 1
done
if [ "$status" = "done" ]; then
  ok "worker processou o import_job (status=done)"
  created=$(jq -r .result.created "$TMP/body")
  [ "$created" = "2" ] && ok "2 cards criados a partir do CSV" || bad "esperado 2 cards criados, veio $created"
else
  bad "import_job não terminou em 'done' a tempo (status=$status — confira 'docker compose -f docker-compose-local.yml logs import-worker')"
fi

# ---------------------------------------------------------------------------
printf '\n\033[1m%d passaram, %d falharam\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
