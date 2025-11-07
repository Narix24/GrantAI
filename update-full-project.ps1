# ------------------------------------------------------------------
# update-full-project.ps1  –  “What did *I* actually write?” report
# ------------------------------------------------------------------
param(
    [string]$OutFile = "project-structure.md"
)

# ---------- folders that are NEVER source code ----------
$excludeFolderMasks = @(
    'node_modules', '.git', '.vscode', '.idea', '.vs',
    'dist', 'build', 'coverage', 'logs', 'tmp', 'temp',
    '__pycache__', '.venv', 'venv', '.env', 'env',
    '.next', '.nuxt', '.cache', '.parcel-cache',
    '.vite', '.expo', '.gradle', 'Pods', 'target'
)

# ---------- files that are NEVER source code  ----------
$excludeFileMasks = @(
    '*.log', '*.lock', '*.tmp', '*.temp', '*.swp', '*.swo',
    '.DS_Store', 'Thumbs.db', 'desktop.ini',
    '.env*', 'project-structure.md'
)

# ---------- helpers ----------
function Test-ExcludedFolder {   # true  -> skip this folder completely
    param([string]$folderName)
    foreach ($m in $excludeFolderMasks) {
        if ($folderName -like "*$m*") { return $true }
    }
    $false
}

function Test-ExcludedFile {    # true  -> skip this file
    param([System.IO.FileInfo]$file)
    foreach ($m in $excludeFileMasks) {
        if ($file.Name -like $m) { return $true }
    }
    $false
}

# ---------- main ----------
$root   = $PSScriptRoot
$output = Join-Path $root $OutFile

Write-Host "Scanning project (skipping deps / builds) …" -ForegroundColor Yellow

$sourceFiles = Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
               Where-Object {
                   $parts = $_.FullName.Substring($root.Length) -split '\\'
                   # if any path-part is black-listed -> drop
                   $ok = $true
                   foreach ($p in $parts) { if (Test-ExcludedFolder $p) { $ok = $false; break } }
                   $ok -and (-not (Test-ExcludedFile $_))
               }

if (-not $sourceFiles) {
    Write-Host "No source files found." -ForegroundColor DarkYellow
    return
}

# ---------- build markdown ----------
$md  = [System.Text.StringBuilder]::new()
[void]$md.AppendLine("Project source-tree  –  generated $(Get-Date -f 'yyyy-MM-dd HH:mm')")
[void]$md.AppendLine("Root: $root")
[void]$md.AppendLine("=" * 60)

$nonEmpty = 0
$total    = 0

$groups = $sourceFiles | Group-Object {
    $rel = $_.FullName.Substring($root.Length).TrimStart('\')
    ($rel -split '\\')[0]
}

foreach ($g in $groups | Sort-Object Name) {
    [void]$md.AppendLine("")
    [void]$md.AppendLine("$($g.Name)/")
    foreach ($file in ($g.Group | Sort-Object FullName)) {
        $total++
        $empty = $file.Length -eq 0
        $icon  = if ($empty) { "❌ empty" } else { "✅ done"; $nonEmpty++ }
        $name  = $file.Name.PadRight(45)
        $date  = $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
        [void]$md.AppendLine("  $name  [$icon]  ($date)")
    }
}

[void]$md.AppendLine("")
[void]$md.AppendLine("=" * 60)
[void]$md.AppendLine("Progress: $nonEmpty / $total files contain content.")

$md.ToString() | Out-File $output -Encoding utf8
Write-Host "Report saved → $output" -ForegroundColor Green