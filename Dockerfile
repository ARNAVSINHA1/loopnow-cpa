# Loopnow CPA
# Receipt Processing & GST/HST Bookkeeping
# Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.

FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .

RUN DATABASE_URL="postgresql://loopnow:build-only@localhost:5432/loopnow_cpa?schema=public" npx prisma generate
RUN DATABASE_URL="postgresql://loopnow:build-only@localhost:5432/loopnow_cpa?schema=public" npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]