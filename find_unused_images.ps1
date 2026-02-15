$ErrorActionPreference = "SilentlyContinue"
$extensions = @(".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".ico")
$excludeDirs = @(".git", "_unused_images_backup", "node_modules", ".gemini", ".history", ".vscode")

# Get all files
$allFiles = Get-ChildItem -Path . -Recurse -File

# Filter out excluded directories
$filteredFiles = $allFiles | Where-Object {
    $path = $_.FullName
    $shouldExclude = $false
    foreach ($dir in $excludeDirs) {
        if ($path -like "*\$dir\*") {
            $shouldExclude = $true
            break
        }
    }
    return -not $shouldExclude
}

# Separate images and code/content files
$images = $filteredFiles | Where-Object { $extensions -contains $_.Extension.ToLower() }
$searchTargets = $filteredFiles | Where-Object { $extensions -notcontains $_.Extension.ToLower() }

Write-Host "Checking $($images.Count) images against $($searchTargets.Count) files..."

foreach ($img in $images) {
    $name = $img.Name
    $isUsed = $false
    
    # Fast check using Select-String
    # We strip the extension for a looser check if needed, but user said "basename" which includes extension.
    # We will check strictly for the full filename first.
    
    foreach ($target in $searchTargets) {
        $content = Get-Content $target.FullName -Raw
        if ($content -match [regex]::Escape($name)) {
            $isUsed = $true
            break
        }
    }
    
    if (-not $isUsed) {
        Write-Output "UNUSED: $($img.FullName)"
    }
}
