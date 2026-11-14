# Smart City backend: production image (builds natively on the Oracle Arm server)

# ---- build stage: install everything, generate Prisma client, compile ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# bcrypt may compile from source on Arm, so the build tools must be present
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN if [ -f prisma7.config.ts ]; then npx prisma generate --config prisma7.config.ts; else npx prisma generate; fi
RUN npm run build
# keep only runtime dependencies (prisma CLI stays: it's a dependency, needed for migrations)
RUN npm prune --omit=dev

# ---- runtime stage: small image, runs as the non-root "node" user ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/prisma*.config.ts ./
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 3000
ENTRYPOINT ["tini", "--", "entrypoint.sh"]
CMD ["start"]
