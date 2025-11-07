#!/bin/bash
echo "🚀 Grant-AI Production Deployment"

# Build frontend
npm run build

# Run health check before deployment
npm run health-check
if [ $? -ne 0 ]; then
  echo "❌ Health check failed - aborting deployment"
  exit 1
fi

# Start production services
docker-compose -f docker-compose.prod.yml up -d --build

echo "✅ Deployment completed successfully!"
echo "🔧 Monitor logs with: docker logs grant-ai-app"
echo "🌐 Health check endpoint: http://localhost:3000/api/system/health"