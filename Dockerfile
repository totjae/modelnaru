FROM node:24.14-alpine AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
RUN pnpm --filter @modelnaru/config build \
    && pnpm --filter @modelnaru/database build \
    && pnpm --filter @modelnaru/admin-cli build \
    && pnpm --filter @modelnaru/api build \
    && pnpm --filter @modelnaru/web build

FROM dependencies AS api
ENV NODE_ENV=production
COPY --from=build /workspace/packages/config/dist /workspace/packages/config/dist
COPY --from=build /workspace/packages/database/dist /workspace/packages/database/dist
COPY --from=build /workspace/apps/api/dist /workspace/apps/api/dist
WORKDIR /workspace/apps/api
USER node
CMD ["node", "--enable-source-maps", "dist/main.js"]

FROM dependencies AS web
ENV NODE_ENV=production
COPY --from=build /workspace/apps/web/.next /workspace/apps/web/.next
WORKDIR /workspace/apps/web
USER node
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]

FROM dependencies AS admin
ENV NODE_ENV=production
COPY --from=build /workspace/packages/config/dist /workspace/packages/config/dist
COPY --from=build /workspace/tools/admin-cli/dist /workspace/tools/admin-cli/dist
ENTRYPOINT ["node", "/workspace/tools/admin-cli/dist/cli.js"]
CMD ["help"]
