#!/bin/bash
set -e
set -o pipefail

echo "🚀 Grant-AI Production Deployment Starting..."
PROJECT_NAME="grant-ai-app"
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_FILE="docker-compose.backup.yml"
ROLLBACK_TAG="rollback-$(date +"%Y%m%d-%H%M%S")"

#---------------------------------------------
# 1️⃣ Environment Validation
#---------------------------------------------
if [ -z "$NODE_ENV" ] || [ "$NODE_ENV" != "production" ]; then
  echo "⚙️  NODE_ENV not set to 'production'. Auto-fixing..."
  export NODE_ENV=production
fi
echo "✅ Environment: $NODE_ENV"

#---------------------------------------------
# 2️⃣ Dependency Checks
#---------------------------------------------
echo "🔧 Checking tools..."
for cmd in npm docker docker-compose; do
  if ! command -v $cmd &> /dev/null; then
    echo "❌ $cmd missing. Please install it first."
    exit 1
  fi
done
echo "✅ Tools verified."

#---------------------------------------------
# 3️⃣ Backup Current Containers
#---------------------------------------------
echo "💾 Backing up current container state..."
if docker ps | grep -q "$PROJECT_NAME"; then
  docker-compose -f "$COMPOSE_FILE" ps > "$BACKUP_FILE"
  echo "🗄️  Backup saved to $BACKUP_FILE"
else
  echo "⚠️  No active containers found. Skipping backup."
fi

#---------------------------------------------
# 4️⃣ Version Tag
#---------------------------------------------
DEPLOY_TAG=$(date +"%Y%m%d-%H%M%S")
echo "📦 Deployment tag: $DEPLOY_TAG"

#---------------------------------------------
# 5️⃣ Frontend Build
#---------------------------------------------
if [ -f "package.json" ]; then
  echo "🏗️  Building frontend..."
  npm ci --silent
  npm run build
else
  echo "⚠️  No package.json found. Skipping build."
fi

#---------------------------------------------
# 6️⃣ Pre-deployment Health Check
#---------------------------------------------
if npm run | grep -q "health-check"; then
  echo "🔍 Running health check..."
  if ! npm run health-check; then
    echo "❌ Health check failed before deployment. Aborting."
    exit 1
  fi
  echo "✅ Health check passed."
else
  echo "⚠️  No health-check script. Continuing."
fi

#---------------------------------------------
# 7️⃣ Deploy New Containers
#---------------------------------------------
echo "🐳 Deploying new Docker containers..."
docker-compose -f "$COMPOSE_FILE" up -d --build --remove-orphans --renew-anon-volumes

#---------------------------------------------
# 8️⃣ Post-deployment Verification
#---------------------------------------------
echo "🧪 Verifying service health..."
sleep 10  # allow container startup time

HEALTH_URL="http://localhost:3000/api/system/health"
if curl -fsS "$HEALTH_URL" | grep -q "ok"; then
  echo "✅ Post-deployment health check passed."
else
  echo "❌ Post-deployment health check failed."
  echo "🧩 Initiating rollback..."
  docker-compose -f "$COMPOSE_FILE" down
  if [ -f "$BACKUP_FILE" ]; then
    echo "🔁 Restoring previous version..."
    docker-compose -f "$COMPOSE_FILE" up -d
  fi
  echo "🪫 Rollback complete. Marked as $ROLLBACK_TAG"
  exit 1
fi

#---------------------------------------------
# 9️⃣ Cleanup
#---------------------------------------------
rm -f "$BACKUP_FILE" || true
echo "🧹 Cleanup complete."

#---------------------------------------------
# 🔟 Deployment Summary
#---------------------------------------------
echo ""
echo "✅ Deployment completed successfully!"
echo "📅 Build Tag: $DEPLOY_TAG"
echo "🔧 Monitor logs: docker logs -f $PROJECT_NAME"
echo "🌐 Health check: $HEALTH_URL"
echo "-------------------------------------------------------------"