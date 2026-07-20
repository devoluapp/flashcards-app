# PocketBase v0.39.7 — imagem mínima
FROM alpine:3.20

ARG PB_VERSION=0.39.7
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates unzip wget

WORKDIR /pb
# Baixa o binário oficial da release correspondente à sua versão.
RUN wget -O /tmp/pb.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
    && unzip /tmp/pb.zip -d /pb \
    && rm /tmp/pb.zip

# pb_migrations e pb_hooks vão DENTRO da imagem (versionados junto com a tag da release).
# Só pb_data (SQLite + arquivos enviados) é estado de runtime — esse fica de fora da
# imagem, num bind mount fixo (ver docker-compose.yml), para sobreviver a cada deploy.
COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks

EXPOSE 8090
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", \
     "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks"]
