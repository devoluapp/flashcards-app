# Build estático (SPA) do SvelteKit + nginx pra servir. As envs PUBLIC_* abaixo são
# lidas em BUILD TIME por $env/static/public (ficam embutidas no bundle) — não
# adianta trocá-las depois só no runtime do container, precisa rebuildar a imagem.
# No Coolify: marque essas variáveis como "Available at Buildtime" na aba de envs.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG PUBLIC_PB_URL
ARG PUBLIC_APP_VERSION=dev
ENV PUBLIC_PB_URL=${PUBLIC_PB_URL} \
    PUBLIC_APP_VERSION=${PUBLIC_APP_VERSION}

RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
