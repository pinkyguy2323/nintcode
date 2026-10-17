# Builds NintCode.
# Windows RC.EXE cannot compile resource files from paths with Cyrillic characters,
# so the project is mirrored to an ASCII-safe path and built there.
param(
  [string]$BuildDir = "F:\nintcode",
  [switch]$Dev,
  [switch]$SyncBack
)

$src = $PSScriptRoot
Write-Host "Source:    $src"
Write-Host "Build dir: $BuildDir"

New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
robocopy $src $BuildDir /E /XD node_modules target dist installer .git /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -gt 7) { throw "robocopy failed: $LASTEXITCODE" }

Push-Location $BuildDir
try {
  if (-not (Test-Path "$BuildDir\node_modules")) {
    npm.cmd install --no-audit --no-fund
    if (-not $?) { throw "npm install failed" }
  }
  if ($Dev) {
    npx.cmd tauri dev
  } else {
    npx.cmd tauri build
    if (-not $?) { throw "tauri build failed" }

    $bundle = Join-Path $BuildDir "src-tauri\target\release\bundle"
    $nsis = Join-Path $bundle "nsis"
    $msi = Join-Path $bundle "msi"
    $dst = Join-Path $src "installer"
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
    Get-ChildItem -Path $dst -File | Remove-Item -Force
    Get-ChildItem -Path $nsis, $msi -ErrorAction SilentlyContinue | Copy-Item -Destination $dst -Force
    Write-Host "Installers copied to $dst"
    Get-ChildItem $dst | Select-Object Name, @{N='MB';E={[math]::Round($_.Length/1MB,2)}} | Format-Table
  }

  if ($SyncBack) {
    robocopy "$BuildDir\src" "$src\src" /E /NFL /NDL /NJH /NJS
    robocopy "$BuildDir\src-tauri\src" "$src\src-tauri\src" /E /NFL /NDL /NJH /NJS
    Write-Host "Sources synced back to $src"
  }
} finally {
  Pop-Location
}
