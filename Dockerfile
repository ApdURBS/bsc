# Um único serviço: a API serve também o frontend compilado.
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY backend/package*.json backend/
RUN cd backend && npm ci
COPY frontend frontend
COPY backend backend
RUN cd frontend && npm run build && cd ../backend && npm run build

FROM node:22-alpine
ENV NODE_ENV=production TZ=America/Sao_Paulo
WORKDIR /app/backend
COPY --from=build /app/backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/drizzle ./drizzle
COPY --from=build /app/backend/src ./src
COPY --from=build /app/backend/assets ./assets
COPY --from=build /app/frontend/dist ../frontend/dist
ENV UPLOAD_DIR=/data/storage
VOLUME /data/storage
EXPOSE 3000
# aplica migrações, garante os cadastros básicos e sobe o servidor
CMD ["sh", "-c", "npx tsx src/db/migrate.ts && npx tsx src/db/seed.ts && node dist/src/server.js"]
