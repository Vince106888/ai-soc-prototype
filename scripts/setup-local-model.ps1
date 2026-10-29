<#
  LindaBiz - one-shot local model setup (Windows, PowerShell 5.1+)

  Checks disk space, installs Ollama if missing, pulls the explainer model,
  confirms it answers on 127.0.0.1, then runs the synthetic evidence check.
  Nothing here sends incident data off the computer.

  Run from the repository folder:
      powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-model.ps1

  Options:
      -Model qwen2.5:1.5b      smaller model if disk/RAM is tight (~1 GB)
      -ModelDir D:\ollama      store models on another drive
      -Runs 1                  fewer evidence-check runs (faster)
      -SkipCheck               skip the evidence check
#>
param(
    [string]$Model = "qwen2.5:3b",
    [string]$ModelDir = "",
    [int]$Runs = 1,
    [switch]$SkipCheck
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$OllamaUrl = "http://127.0.0.1:11434"

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    OK  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    !!  $text" -ForegroundColor Yellow }

# 1. Disk space -------------------------------------------------------------
Step "Checking free disk space"
$target = if ($ModelDir) { $ModelDir } else { $env:USERPROFILE }
$driveLetter = (Split-Path -Qualifier $target).TrimEnd(':')
$freeGB = [math]::Round((Get-PSDrive $driveLetter).Free / 1GB, 1)
$needGB = if ($Model -like "*1.5b*") { 2 } else { 4 }
Write-Host "    Drive ${driveLetter}: has $freeGB GB free (need about $needGB GB for Ollama + $Model)"
if ($freeGB -lt $needGB) {
    Warn "Not enough space. Free some space, or rerun with -Model qwen2.5:1.5b or -ModelDir on another drive."
    exit 1
}
Ok "Enough space"

if ($ModelDir) {
    New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null
    $env:OLLAMA_MODELS = $ModelDir
    [Environment]::SetEnvironmentVariable("OLLAMA_MODELS", $ModelDir, "User")
    Ok "Models will be stored in $ModelDir"
}

# 2. Install Ollama ---------------------------------------------------------
Step "Checking for Ollama"
$ollamaDir = Join-Path $env:LOCALAPPDATA "Programs\Ollama"
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    if (Test-Path (Join-Path $ollamaDir "ollama.exe")) {
        $env:Path = "$ollamaDir;$env:Path"
    } elseif (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "    Installing Ollama with winget (this downloads ~1 GB)..."
        winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
        $env:Path = "$ollamaDir;$env:Path"
    } else {
        Warn "winget is not available. Install Ollama from https://ollama.com/download, then rerun this script."
        exit 1
    }
}
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Warn "Ollama still not found on PATH. Close and reopen PowerShell, then rerun this script."
    exit 1
}
Ok ("Ollama " + (ollama --version 2>&1 | Select-Object -Last 1))

# 3. Make sure the local server is up ---------------------------------------
Step "Starting the local Ollama server on $OllamaUrl"
function ServerUp {
    try { Invoke-RestMethod "$OllamaUrl/api/tags" -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}
if (-not (ServerUp)) {
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    for ($i = 0; $i -lt 30 -and -not (ServerUp); $i++) { Start-Sleep -Seconds 1 }
}
if (-not (ServerUp)) { Warn "Ollama server did not start. Open the Ollama app from the Start menu and rerun."; exit 1 }
Ok "Server answering on loopback"

# 4. Pull the model ---------------------------------------------------------
Step "Pulling $Model (first time only)"
ollama pull $Model
if ($LASTEXITCODE -ne 0) { Warn "Pull failed - check your internet connection and rerun."; exit 1 }
Ok "$Model downloaded"

# 5. Warm-up ----------------------------------------------------------------
Step "Warm-up prompt (first load can take 30-60 s on CPU)"
$sw = [Diagnostics.Stopwatch]::StartNew()
$reply = ollama run $Model "Reply with the single word ready"
if ($LASTEXITCODE -ne 0) { Warn "Model warm-up failed."; exit 1 }
$sw.Stop()
Ok ("Model replied '" + ($reply -join ' ').Trim() + "' in " + [math]::Round($sw.Elapsed.TotalSeconds, 1) + " s")

# 6. Evidence check through the real code path ------------------------------
$env:AI_SOC_EXPLAINER = "ollama"
$env:AI_SOC_OLLAMA_MODEL = $Model
if (-not $SkipCheck) {
    Step "Running the synthetic explainer check ($Runs run(s))"
    $checkOutput = Join-Path 'data' ('explainer-check-' + [DateTime]::UtcNow.ToString('yyyy-MM-dd') + '.json')
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        uv run python -m app.explain --check --runs $Runs --output $checkOutput
    } else {
        python -m app.explain --check --runs $Runs --output $checkOutput
    }
    if ($LASTEXITCODE -ne 0) { Warn "Evidence check failed. See the output above."; exit 1 }
    $checkReport = Get-Content -LiteralPath $checkOutput -Raw | ConvertFrom-Json
    if ($checkReport.result -ne 'completed' -or $checkReport.summary.attempts -lt 1 -or
        $checkReport.summary.valid_explanations -ne $checkReport.summary.attempts) {
        Warn "The check did not produce valid model explanations for every attempt. Inspect $checkOutput."
        exit 1
    }
    Ok "Evidence written to $checkOutput - keep it for the report"
}

# 7. Next steps -------------------------------------------------------------
Step "Done. To demo with the local model, in this same window:"
Write-Host '    $env:AI_SOC_EXPLAINER = "ollama"'
Write-Host "    `$env:AI_SOC_OLLAMA_MODEL = `"$Model`""
Write-Host '    uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log'
Write-Host '    then open http://127.0.0.1:8000 and press "Explain in plain language" on an incident.'
