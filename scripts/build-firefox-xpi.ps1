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

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function New-XpiArchive([string]$source, [string]$destination) {
  $stream = [System.IO.File]::Open(
    $destination,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  try {
    $archive = [System.IO.Compression.ZipArchive]::new(
      $stream,
      [System.IO.Compression.ZipArchiveMode]::Create,
      $false
    )
    try {
      Get-ChildItem -LiteralPath $source -File -Recurse |
        Where-Object { $_.Name -ne ".gitkeep" } |
        Sort-Object FullName |
        ForEach-Object {
          $relative = $_.FullName.Substring($source.Length).TrimStart([char[]]"\\/") -replace "\\", "/"
          $entry = $archive.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
          $entry.LastWriteTime = [DateTimeOffset]$_.LastWriteTimeUtc
          $input = [System.IO.File]::OpenRead($_.FullName)
          $output = $entry.Open()
          try {
            $input.CopyTo($output)
          } finally {
            $output.Dispose()
            $input.Dispose()
          }
        }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

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
  New-XpiArchive -source $source -destination $destination
  Write-Output "Criado: $destination"
}
