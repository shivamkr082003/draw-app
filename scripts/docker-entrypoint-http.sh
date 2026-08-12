#!/bin/sh
set -e

cd /app/packages/db
echo "Running Prisma migrations..."
npx prisma migrate deploy

cd /app/apps/http-backend
echo "Starting HTTP backend..."
exec node dist/apps/http-backend/src/index.js
