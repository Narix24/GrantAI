# ===============================
# 🚀 Grant-AI Production Deployment Script (PowerShell)
# ===============================
# Usage:
#   Set-ExecutionPolicy RemoteSigned -Scope Process
#   $env:NODE_ENV = "production"
#   ./scripts/deploy-prod.ps1
# ===============================

# Stop on first error
$ErrorActionPreference = "Stop"

Write-Host "🚀 Grant-AI Production Deployment Starting..." -ForegroundColor Cyan

#---------------------------------------------
# 1️⃣ Environment Validation
#---------------------------------------------
if ($env:NODE_ENV -ne "production") {
    Write-Host "⚙️  NODE_ENV not set to 'production'. Auto-fixing..." -ForegroundColor Yellow
    $env:NODE_ENV = "production"
}
Write-Host "✅ Environment: $($env:NODE_ENV)" -ForegroundColor Green

#---------------------------------------------
# 2️⃣ Tool Check
#---------------------------------------------
Write-Host "🔧 Checking tools..." -ForegroundColor Cyan

$tools = @("node", "npm", "docker", "docker-compose")
foreach ($tool in $tools) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "❌ Missing tool: $tool" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✅ Tools verified." -ForegroundColor Green

#---------------------------------------------
# 3️⃣ Backup Running Containers
#---------------------------------------------
Write-Host "💾 Backing up current container state..." -ForegroundColor Cyan
$containers = docker ps -q
if ($containers) {
    docker ps > "./backup-containers-$(Get-Date -Format yyyyMMdd-HHmmss).txt"
    Write-Host "✅ Container list saved." -ForegroundColor Green
} else {
    Write-Host "⚠️  No active containers found. Skipping backup." -ForegroundColor Yellow
}

#---------------------------------------------
# 4️⃣ Version Tagging
#---------------------------------------------
$DEPLOY_TAG = Get-Date -Format "yyyyMMdd-HHmmss"
Write-Host "📦 Deployment tag: $DEPLOY_TAG" -ForegroundColor Cyan

#---------------------------------------------
# 5️⃣ Frontend Build
#---------------------------------------------
Write-Host "🏗️  Building frontend..." -ForegroundColor Cyan
npm run build

#---------------------------------------------
# 6️⃣ Health Check
#---------------------------------------------
Write-Host "🔍 Running health check..." -ForegroundColor Cyan
try {
    npm run health-check
    Write-Host "✅ Health check passed." -ForegroundColor Green
} catch {
    Write-Host "❌ Health check failed — aborting deployment." -ForegroundColor Red
    exit 1
}

#---------------------------------------------
# 7️⃣ Docker Compose Deployment
#---------------------------------------------
Write-Host "🐳 Starting Docker containers..." -ForegroundColor Cyan
docker-compose -f docker-compose.prod.yml up -d --build --remove-orphans --renew-anon-volumes

#---------------------------------------------
# 8️⃣ Post-deployment Info
#---------------------------------------------
Write-Host ""
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host "Build Tag: $DEPLOY_TAG"
Write-Host "Monitor logs with: docker logs -f grant-ai-app"
Write-Host "Health check endpoint: http://localhost:3000/api/system/health"
Write-Host "-------------------------------------------------------------"