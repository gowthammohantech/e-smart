# The API, web app and admin console for local Docker runs (docker-compose.yml).
# One install of the workspace, then a target per app:
#
#   docker build --target api .
#   docker build --target web --build-arg EXPO_PUBLIC_API_URL=http://localhost:4000 .
#   docker build --target admin --build-arg VITE_API_URL=http://localhost:4000 .
#
# The web and admin builds compile the API address into the bundle, so it is a
# build argument: the address the browser uses, not one inside the Docker network.

FROM node:22-bookworm-slim AS workspace
WORKDIR /repo
COPY . .
RUN npm ci --no-audit --no-fund

# The API bundle runs against the workspace install; db:migrate (tsx) uses it too.
FROM workspace AS api
RUN npm run build -w @esmart/api
ENV NODE_ENV=development
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]

FROM workspace AS web-build
ARG EXPO_PUBLIC_API_URL=http://localhost:4000
# Shown in Settings → About next to the version, e.g. the commit being deployed.
ARG EXPO_PUBLIC_BUILD=
RUN cd apps/web && npx expo export -p web

FROM workspace AS admin-build
ARG VITE_API_URL=http://localhost:4000
RUN npm run build -w @esmart/admin

# Static servers: just the built files and tools/static-server.mjs, no node_modules.
FROM node:22-bookworm-slim AS web
WORKDIR /repo
ARG EXPO_PUBLIC_API_URL=http://localhost:4000
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
COPY tools/static-server.mjs tools/
COPY --from=web-build /repo/apps/web/serve.mjs apps/web/
COPY --from=web-build /repo/apps/web/dist apps/web/dist
ENV PORT=8081
EXPOSE 8081
CMD ["node", "apps/web/serve.mjs"]

FROM node:22-bookworm-slim AS admin
WORKDIR /repo
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
COPY tools/static-server.mjs tools/
COPY --from=admin-build /repo/apps/admin/serve.mjs apps/admin/
COPY --from=admin-build /repo/apps/admin/dist apps/admin/dist
ENV PORT=5174
EXPOSE 5174
CMD ["node", "apps/admin/serve.mjs"]
