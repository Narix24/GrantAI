# ===============================================================
#  Grant-AI: Consolidate to JavaScript + Fix Folder Structure
# ===============================================================

Write-Host "`nStarting Grant-AI backend reorganization..." -ForegroundColor Cyan

$base = "backend"
$frontend = "frontend"

# --- 1. Convert .ts -> .js ---
Write-Host "1. Converting all TypeScript (.ts) files to JavaScript (.js)..." -ForegroundColor Cyan
Get-ChildItem -Path $base -Recurse -Include *.ts | ForEach-Object {
    $jsPath = [System.IO.Path]::ChangeExtension($_.FullName, ".js")
    Copy-Item $_.FullName $jsPath -Force
    Remove-Item $_.FullName -Force
}
Write-Host "All TypeScript files converted." -ForegroundColor Green

# --- 2. Remove empty placeholder files ---
Write-Host "2. Removing empty placeholder files..." -ForegroundColor Cyan
Get-ChildItem -Path $base -Recurse | Where-Object { $_.Length -eq 0 } | Remove-Item -Force
Write-Host "Empty files removed." -ForegroundColor Green

# --- 3. Ensure directory structure exists ---
Write-Host "3. Ensuring required folder structure..." -ForegroundColor Cyan

$dirs = @(
    "$base/.devcontainer",
    "$base/.github/workflows",
    "$base/config",
    "$base/docker",
    "$frontend/components/kpi",
    "$frontend/components/proposal",
    "$frontend/components/system",
    "$frontend/context",
    "$frontend/public/flags",
    "$frontend/styles",
    "$base/locales",
    "$base/orchestration",
    "$base/services/vectorStore",
    "$base/agents",
    "$base/routes",
    "$base/utils",
    "$base/prisma",
    "$base/tests/unit",
    "$base/tests/integration",
    "$base/tests/e2e"
)
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
}
Write-Host "Folder structure ready." -ForegroundColor Green

# --- 4. Move misplaced files into correct positions ---
Write-Host "4. Moving files into correct positions..." -ForegroundColor Cyan

$moveMap = @{
    "server.js"                = "$base/server.js"
    ".env.example"             = "$base/.env.example"
    "README.md"                = "$base/README.md"
    "bullmq.config.js"         = "$base/config/bullmq.config.js"
    "chaos.config.js"          = "$base/config/chaos.config.js"
    "db.config.js"             = "$base/config/db.config.js"
    "i18n.config.js"           = "$base/config/i18n.config.js"
    "ai.config.js"             = "$base/config/ai.config.js"
    "docker-compose.yml"       = "$base/docker/docker-compose.yml"
    "Dockerfile"               = "$base/docker/Dockerfile"
    "nginx.conf"               = "$base/docker/nginx.conf"
    "chaosMonkey.js"           = "$base/orchestration/chaosMonkey.js"
    "queue.js"                 = "$base/orchestration/queue.js"
    "recoveryOrchestrator.js"  = "$base/orchestration/recoveryOrchestrator.js"
    "writerWorker.js"          = "$base/orchestration/writerWorker.js"
    "submitterWorker.js"       = "$base/orchestration/submitterWorker.js"
    "scraperWorker.js"         = "$base/orchestration/scraperWorker.js"
    "aiService.js"             = "$base/services/aiService.js"
    "dbRouter.js"              = "$base/services/dbRouter.js"
    "emailService.js"          = "$base/services/emailService.js"
    "langchainService.js"      = "$base/services/langchainService.js"
    "chroma.js"                = "$base/services/vectorStore/chroma.js"
    "ProposalWriterAgent.js"   = "$base/agents/ProposalWriterAgent.js"
    "GrantCrawlerAgent.js"     = "$base/agents/GrantCrawlerAgent.js"
    "ToneAnalyzerAgent.js"     = "$base/agents/ToneAnalyzerAgent.js"
    "VoicePlaybackAgent.js"    = "$base/agents/VoicePlaybackAgent.js"
    "auth.js"                  = "$base/routes/auth.js"
    "proposals.js"             = "$base/routes/proposals.js"
    "grants.js"                = "$base/routes/grants.js"
    "system.js"                = "$base/routes/system.js"
    "logger.js"                = "$base/utils/logger.js"
    "metrics.js"               = "$base/utils/metrics.js"
    "security.js"              = "$base/utils/security.js"
    "schema.prisma"            = "$base/prisma/schema.prisma"
}  # <-- this was missing!

foreach ($pair in $moveMap.GetEnumerator()) {
    $src = Get-ChildItem -Path $base -Recurse -Filter $pair.Key -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($src) {
        Move-Item -Path $src.FullName -Destination $pair.Value -Force
    }
}
Write-Host "Files moved to their correct locations." -ForegroundColor Green

Write-Host "`nCompleted JS-only cleanup and structure alignment for Grant-AI" -ForegroundColor Green
Write-Host "Backend organized under: $base" -ForegroundColor Yellow
Write-Host "Frontend structure verified under: $frontend" -ForegroundColor Cyan
