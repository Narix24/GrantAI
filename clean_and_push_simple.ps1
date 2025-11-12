# clean_and_push_simple.ps1
# Cleans unwanted files and pushes to GitHub
# Usage: Right-click > Run with PowerShell

# --------------------------
# CONFIGURATION
# --------------------------
$repoPath = "D:\Grant-AI"                       # Path to your local repo
$remoteUrl = "https://github.com/Narix24/GrantAI.git"  # Your GitHub repo
$foldersToRemove = @("node_modules","venv")     # Folders to remove
$filePatternsToRemove = @("*.log","*.sqlite*",".DS_Store")  # File patterns to remove
# --------------------------

# Step 1: Go to repo folder
Write-Host "Changing directory to repo..."
Set-Location $repoPath

# Step 2: Ensure .gitignore exists
if (!(Test-Path ".gitignore")) {
    Write-Host "Creating .gitignore..."
    @"
node_modules/
venv/
*.log
*.sqlite*
.DS_Store
dist/
build/
coverage/
test-results/
logs/
public/audio/
public/screenshots/
__mocks__/
"@ | Out-File -Encoding UTF8 .gitignore
} else {
    Write-Host ".gitignore exists."
}

# Step 3: Remove unwanted files/folders from Git tracking
foreach ($folder in $foldersToRemove) {
    if (Test-Path $folder) {
        Write-Host "Removing $folder from Git tracking..."
        git rm -r --cached $folder -q
    }
}

foreach ($pattern in $filePatternsToRemove) {
    Write-Host "Removing files matching pattern: $pattern"
    git ls-files $pattern | ForEach-Object { git rm --cached $_ -q }
}

# Step 4: Commit the removals
git add .gitignore
git commit -m "Remove unwanted files and folders from repository" -q

# Step 5: Set GitHub remote if not set
$remoteCheck = git remote get-url origin 2>$null
if (-not $remoteCheck) {
    Write-Host "Setting remote URL..."
    git remote add origin $remoteUrl
} else {
    Write-Host "Remote origin already exists."
}

# Step 6: Force push to GitHub
Write-Host "Pushing cleaned repo to GitHub..."
git branch -M main
git push --set-upstream origin main --force

Write-Host "✅ Done! Repo cleaned and pushed to GitHub."