param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\dist")
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
$forbidden = @("ser" + "vice" + "now", "gra" + "nado", "gra" + "nadoprod", "ser" + "vice")
$packages = @(
  @{ Name = "helpdesk-reply"; File = "helpdesk-reply-1.6.26.xpi" },
  @{ Name = "quick-reply"; File = "helpdesk-reply-quick-reply-1.0.4.xpi" }
)

New-Item -ItemType Directory -Path $output -Force | Out-Null

foreach ($package in $packages) {
  $source = Join-Path $root "firefox\$($package.Name)"
  $manifestPath = Join-Path $source "manifest.json"
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  if (-not $manifest.name -or -not $manifest.version) {
    throw "Manifesto inválido: $manifestPath"
  }

  Get-ChildItem -LiteralPath $source -File -Recurse | ForEach-Object {
    $text = [System.IO.File]::ReadAllText($_.FullName).ToLowerInvariant()
    foreach ($term in $forbidden) {
      if ($text.Contains($term)) {
        throw "Referência não permitida encontrada em $($_.FullName)"
      }
    }
  }

  $destination = Join-Path $output $package.File
  if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Force
  }
  $temporaryZip = "$destination.zip"
  if (Test-Path -LiteralPath $temporaryZip) {
    Remove-Item -LiteralPath $temporaryZip -Force
  }
  Compress-Archive -Path (Join-Path $source "*") -DestinationPath $temporaryZip -CompressionLevel Optimal
  Move-Item -LiteralPath $temporaryZip -Destination $destination
  Write-Output "Criado: $destination"
}
