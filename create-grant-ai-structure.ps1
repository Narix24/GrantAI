# ================================================================
#  Grant-AI Project Structure Creator
#  Creates all directories, locale files, and test stubs.
# ================================================================

$root = "grant-ai"

# ---------------------------
# 1️⃣ Create All Directories
# ---------------------------
$dirs = @(
    "$root/.devcontainer",
    "$root/.github/workflows",
    "$root/config",
    "$root/docker",
    "$root/frontend/components/kpi",
    "$root/frontend/components/proposal",
    "$root/frontend/components/system",
    "$root/frontend/context",
    "$root/frontend/public/flags",
    "$root/frontend/styles",
    "$root/locales",
    "$root/orchestration",
    "$root/services/vectorStore",
    "$root/agents",
    "$root/routes",
    "$root/utils",
    "$root/prisma",

    # ---- Tests ----
    "$root/tests/e2e/fixtures",
    "$root/tests/e2e/plugins",
    "$root/tests/e2e/support",
    "$root/tests/integration/services",
    "$root/tests/integration/orchestration",
    "$root/tests/integration/agents",
    "$root/tests/integration/routes",
    "$root/tests/integration/utils",
    "$root/tests/unit/services",
    "$root/tests/unit/agents",
    "$root/tests/unit/utils",
    "$root/tests/unit/frontend/components/kpi",
    "$root/tests/unit/frontend/components/proposal",
    "$root/tests/unit/frontend/components/system",
    "$root/tests/unit/frontend/context"
)

foreach ($dir in $dirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
        Write-Host "📁 Created directory: $dir"
    }
}

# ---------------------------
# 2️⃣ Create Core Project Files
# ---------------------------
$files = @(
    "$root/.devcontainer/devcontainer.json",
    "$root/.devcontainer/Dockerfile",
    "$root/.github/workflows/ci.yml",
    "$root/.github/workflows/cd.yml",
    "$root/.github/workflows/chaos-test.yml",
    "$root/config/bullmq.config.js",
    "$root/config/chaos.config.js",
    "$root/config/db.config.js",
    "$root/config/i18n.config.js",
    "$root/config/ai.config.js",
    "$root/docker/docker-compose.yml",
    "$root/docker/Dockerfile",
    "$root/docker/nginx.conf",
    "$root/frontend/components/kpi/KPIDashboard.jsx",
    "$root/frontend/components/kpi/RealTimeMetrics.jsx",
    "$root/frontend/components/proposal/ProposalBuilder.jsx",
    "$root/frontend/components/proposal/ToneAnalyzer.jsx",
    "$root/frontend/components/proposal/VoicePlayback.jsx",
    "$root/frontend/components/system/HealthMonitor.jsx",
    "$root/frontend/components/system/ChaosControls.jsx",
    "$root/frontend/context/AuthContext.jsx",
    "$root/frontend/context/WebSocketContext.jsx",
    "$root/frontend/context/ThemeContext.jsx",
    "$root/frontend/public/manifest.json",
    "$root/frontend/styles/globals.css",
    "$root/frontend/styles/theme.js",
    "$root/frontend/App.jsx",
    "$root/locales/en.json",
    "$root/locales/de.json",
    "$root/locales/es.json",
    "$root/locales/fr.json",
    "$root/locales/it.json",
    "$root/locales/nl.json",
    "$root/locales/pl.json",
    "$root/locales/pt.json",
    "$root/locales/ro.json",
    "$root/locales/ru.json",
    "$root/orchestration/chaosMonkey.js",
    "$root/orchestration/queue.js",
    "$root/orchestration/recoveryOrchestrator.js",
    "$root/orchestration/writerWorker.js",
    "$root/orchestration/submitterWorker.js",
    "$root/orchestration/scraperWorker.js",
    "$root/services/aiService.js",
    "$root/services/dbRouter.js",
    "$root/services/emailService.js",
    "$root/services/langchainService.js",
    "$root/services/vectorStore/chroma.js",
    "$root/agents/ProposalWriterAgent.js",
    "$root/agents/GrantCrawlerAgent.js",
    "$root/agents/ToneAnalyzerAgent.js",
    "$root/agents/VoicePlaybackAgent.js",
    "$root/routes/auth.js",
    "$root/routes/proposals.js",
    "$root/routes/grants.js",
    "$root/routes/system.js",
    "$root/utils/logger.js",
    "$root/utils/metrics.js",
    "$root/utils/security.js",
    "$root/prisma/schema.prisma",
    "$root/.env.example",
    "$root/server.js",
    "$root/README.md",
    "$root/package.json",
    "$root/tsconfig.json"
)

foreach ($file in $files) {
    if (!(Test-Path $file)) {
        New-Item -ItemType File -Path $file | Out-Null
        Write-Host "📄 Created file: $file"
    }
}

# ---------------------------
# 3️⃣ Add Full Test Suite
# ---------------------------
$testFiles = @(
    # E2E
    "$root/tests/e2e/fixtures/test_proposals.json",
    "$root/tests/e2e/fixtures/test_grants.json",
    "$root/tests/e2e/fixtures/user_credentials.json",
    "$root/tests/e2e/plugins/index.js",
    "$root/tests/e2e/support/commands.js",
    "$root/tests/e2e/support/index.js",
    "$root/tests/e2e/support/selectors.js",
    "$root/tests/e2e/proposal_generation.spec.js",
    "$root/tests/e2e/grant_discovery.spec.js",
    "$root/tests/e2e/user_authentication.spec.js",
    "$root/tests/e2e/chaos_resilience.spec.js",
    "$root/tests/e2e/voice_playback.spec.js",
    "$root/tests/e2e/tone_analysis.spec.js",
    "$root/tests/e2e/submission_workflow.spec.js",

    # Integration
    "$root/tests/integration/services/aiService.test.js",
    "$root/tests/integration/services/dbRouter.test.js",
    "$root/tests/integration/services/emailService.test.js",
    "$root/tests/integration/services/langchainService.test.js",
    "$root/tests/integration/services/vectorStore.test.js",
    "$root/tests/integration/orchestration/queue.test.js",
    "$root/tests/integration/orchestration/chaosMonkey.test.js",
    "$root/tests/integration/orchestration/recoveryOrchestrator.test.js",
    "$root/tests/integration/orchestration/writerWorker.test.js",
    "$root/tests/integration/orchestration/scraperWorker.test.js",
    "$root/tests/integration/agents/ProposalWriterAgent.test.js",
    "$root/tests/integration/agents/ToneAnalyzerAgent.test.js",
    "$root/tests/integration/agents/GrantCrawlerAgent.test.js",
    "$root/tests/integration/agents/VoicePlaybackAgent.test.js",
    "$root/tests/integration/routes/auth.test.js",
    "$root/tests/integration/routes/proposals.test.js",
    "$root/tests/integration/routes/grants.test.js",
    "$root/tests/integration/routes/system.test.js",
    "$root/tests/integration/utils/logger.test.js",
    "$root/tests/integration/utils/security.test.js",

    # Unit
    "$root/tests/unit/services/aiService.unit.test.js",
    "$root/tests/unit/services/dbRouter.unit.test.js",
    "$root/tests/unit/services/securityService.unit.test.js",
    "$root/tests/unit/services/i18nService.unit.test.js",
    "$root/tests/unit/agents/ProposalWriterAgent.unit.test.js",
    "$root/tests/unit/agents/ToneAnalyzerAgent.unit.test.js",
    "$root/tests/unit/utils/logger.unit.test.js",
    "$root/tests/unit/utils/metrics.unit.test.js",
    "$root/tests/unit/utils/security.unit.test.js",
    "$root/tests/unit/frontend/components/kpi/KPIDashboard.unit.test.js",
    "$root/tests/unit/frontend/components/kpi/RealTimeMetrics.unit.test.js",
    "$root/tests/unit/frontend/components/proposal/ProposalBuilder.unit.test.js",
    "$root/tests/unit/frontend/components/proposal/ToneAnalyzer.unit.test.js",
    "$root/tests/unit/frontend/components/proposal/VoicePlayback.unit.test.js",
    "$root/tests/unit/frontend/components/system/ChaosControls.unit.test.js",
    "$root/tests/unit/frontend/components/system/HealthMonitor.unit.test.js",
    "$root/tests/unit/frontend/context/AuthContext.unit.test.js",
    "$root/tests/unit/frontend/context/ThemeContext.unit.test.js",
    "$root/tests/unit/frontend/context/WebSocketContext.unit.test.js"
)

foreach ($test in $testFiles) {
    if (!(Test-Path $test)) {
        New-Item -ItemType File -Path $test | Out-Null
        Write-Host "🧪 Created test file: $test"
    }
}

# ---------------------------
# ✅ Final Status
# ---------------------------
Write-Host "`n✅ Full Grant-AI structure with tests and locales created successfully!" -ForegroundColor Green
Write-Host "📦 Open 'grant-ai' in VS Code to begin development." -ForegroundColor Cyan
