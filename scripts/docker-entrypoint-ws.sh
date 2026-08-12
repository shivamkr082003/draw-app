#!/bin/sh
set -e

cd /app/apps/ws-backend
echo "Starting WebSocket backend..."
exec node dist/index.js
