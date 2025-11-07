# ==========================================
# update-backend.ps1
# Clean, aligned tree view of your project files
# ==========================================

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$output = Join-Path $root "backend.txt"

# Folders to EXCLUDE (system, tooling, caches — NOT project code)
$excludeFolders = @(
    '.vscode',
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '__pycache__',
    '.next',
    '.nuxt',
    'logs',
    'tmp',
    'temp',
    '.cache',
    '.parcel-cache',
    '.vite',
    '.vercel',
    '.netlify'
)

# Files to EXCLUDE (lockfiles, local envs, OS junk)
$excludeFiles = @(
    'backend.txt',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'npm-shrinkwrap.json',
    'composer.lock',
    '.DS_Store',
    'Thumbs.db',
    '.env.local',
    '.env.development.local',
    '.env.test.local',
    'debug.log',
    'npm-debug.log',
    'yarn-error.log',
    '.eslintcache',
    '.stylelintcache'
)

# Configuration for alignment
$fileNameMaxWidth = 45   # Truncate very long names if needed
$statusStartCol   = 50   # Status starts at column 50
$timeStartCol     = 75   # Timestamp starts at column 75

try {
    $outputLines = @(
        "Project File Tracker"
        "Last Updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        "=============================================================="
    )

    # Get all files recursively
    $allFiles = Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            # Normalize file name for case-insensitive comparison
            $fileName = $_.Name.ToLower()

            # Skip excluded files
            if ($excludeFiles.ToLower() -contains $fileName) {
                return $false
            }

            # Walk up the directory tree to check for excluded folders
            $current = $_.Directory
            while ($current -and $current.FullName -ne $root) {
                if ($excludeFolders -contains $current.Name) {
                    return $false
                }
                $current = $current.Parent
            }

            # If we reach here, file is NOT in any excluded folder → KEEP IT
            return $true
        } |
        Sort-Object FullName

    # Build directory tree map
    $tree = @{}
    foreach ($file in $allFiles) {
        $dirPath = if ($file.DirectoryName -eq $root) { '.' } else {
            $file.DirectoryName.Substring($root.Length + 1)
        }
        if (-not $tree.ContainsKey($dirPath)) { $tree[$dirPath] = @() }
        $tree[$dirPath] += $file
    }

    # Sort directories: root first, then by depth, then alphabetically
    $sortedDirs = $tree.Keys | Sort-Object {
        if ($_ -eq '.') { 0 } else { ($_ -split '[\\/]').Count }
    }, { $_ }

    # Output tree
    foreach ($dir in $sortedDirs) {
        if ($dir -ne '.') {
            $outputLines += "$dir/"
        } else {
            $outputLines += "."
        }

        foreach ($file in $tree[$dir]) {
            # Safely read content
            $content = ""
            try {
                $content = Get-Content $file.FullName -Raw -ErrorAction Stop
            } catch {
                # File may be locked or binary — treat as empty
            }

            $status = if ($content -and $content.Trim().Length -gt 0) { "[✅ done]" } else { "[❌ empty]" }
            $modified = $file.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
            $fileName = $file.Name

            # Truncate long file names
            if ($fileName.Length -gt $fileNameMaxWidth) {
                $displayFileName = $fileName.Substring(0, $fileNameMaxWidth - 3) + "..."
            } else {
                $displayFileName = $fileName.PadRight($fileNameMaxWidth)
            }

            # Build aligned output line
            $line = "  " + $displayFileName
            $currentLength = $line.Length

            if ($currentLength -lt $statusStartCol) {
                $line += " " * ($statusStartCol - $currentLength)
            }
            $line += $status

            $currentLength = $line.Length
            if ($currentLength -lt $timeStartCol) {
                $line += " " * ($timeStartCol - $currentLength)
            }
            $line += "($modified)"

            $outputLines += $line
        }
        $outputLines += ""  # blank line after folder
    }

    # Summary
    $total = $allFiles.Count
    $done = ($allFiles | Where-Object {
        try {
            $content = Get-Content $_.FullName -Raw -ErrorAction Stop
            return ($content -and $content.Trim().Length -gt 0)
        } catch {
            return $false
        }
    }).Count

    if ($total -eq 0) {
        $outputLines += "(No project files found)"
    }

    $outputLines += "=============================================================="
    $summary = "Progress: $done / $total files contain code."
    $outputLines += $summary

    # Write output
    $outputLines | Out-File -FilePath $output -Encoding UTF8

    Write-Host "[OK] backend.txt updated ($done / $total tracked files) at $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Green

} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}