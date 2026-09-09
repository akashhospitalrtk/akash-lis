FROM node:24-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts backend/tsconfig.json ./
COPY backend/src ./src
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY database /database
EXPOSE 4000
CMD ["sh", "-c", "node dist/src/scripts/migrate.js && node dist/src/scripts/seed.js && node dist/src/server.js"]
