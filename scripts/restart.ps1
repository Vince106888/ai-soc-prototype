param(
    [ValidateRange(1, 65535)][int]$Port = 8001,
    [switch]$Build,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$restartRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$restartDocker = Get-Command docker -ErrorAction SilentlyContinue
if ($restartDocker) { $restartDocker = $restartDocker.Source }
else {
    $restartDocker = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $restartDocker) { throw 'Docker Desktop is not installed. Install it before starting SentinelSME.' }

function Test-RestartDocker([string]$Arguments) {
    # Keep a stopped/unresponsive engine bounded and hide expected native stderr
    # from Windows PowerShell 5's ErrorActionPreference handling.
    $probe = New-Object Diagnostics.Process
    $probe.StartInfo = New-Object Diagnostics.ProcessStartInfo
    $probe.StartInfo.FileName = $restartDocker
    $probe.StartInfo.Arguments = $Arguments
    $probe.StartInfo.UseShellExecute = $false
    $probe.StartInfo.CreateNoWindow = $true
    $probe.StartInfo.RedirectStandardOutput = $true
    $probe.StartInfo.RedirectStandardError = $true
    try {
        [void]$probe.Start()
        $probeOutput = $probe.StandardOutput.ReadToEndAsync()
        $probeError = $probe.StandardError.ReadToEndAsync()
        if (-not $probe.WaitForExit(15000)) { $probe.Kill(); return $false }
        [void]$probeOutput.GetAwaiter().GetResult()
        [void]$probeError.GetAwaiter().GetResult()
        return $probe.ExitCode -eq 0
    } finally { $probe.Dispose() }
}

$restartEnv = Join-Path $restartRoot 'data\docker.env'
if (-not (Test-Path -LiteralPath $restartEnv)) {
    throw 'Saved deployment configuration is missing: data\docker.env. Restore it before restarting; do not replace database credentials.'
}
$restartCompose = @('compose', '--project-name', 'ai-soc-prototype', '--env-file', $restartEnv,
    '-f', (Join-Path $restartRoot 'compose.yaml'))
$restartGoogle = Join-Path $restartRoot 'data\compose.google.json'
$restartHostModels = Join-Path $restartRoot 'data\compose.host-models.json'
$restartExpectedGoogle = $false
if (Test-Path -LiteralPath $restartGoogle) {
    $restartSettings = Get-Content -LiteralPath $restartGoogle -Raw | ConvertFrom-Json
    $restartCallback = [uri]$restartSettings.services.api.environment.AI_SOC_GOOGLE_LOGIN_REDIRECT_URI
    if ($restartCallback.Port -ne $Port) { throw 'The saved Google callback uses a different port. Use that port; do not change OAuth origins silently.' }
    foreach ($restartMount in $restartSettings.services.api.volumes) {
        if (-not (Test-Path -LiteralPath $restartMount.source)) {
            throw 'A saved Google credential or encryption-key file is missing. Restore the private file before restarting.'
        }
    }
    $restartExpectedGoogle = $true
}

Push-Location $restartRoot
$restartOldPort = $env:AI_SOC_PORT
$restartOldEnvFile = $env:AI_SOC_ENV_FILE
try {
    $env:AI_SOC_PORT = [string]$Port
    $env:AI_SOC_ENV_FILE = $restartEnv
    if (-not (Test-RestartDocker 'info --format {{.ServerVersion}}')) {
        $restartDesktop = @(
            (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
            (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
        ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if (-not $restartDesktop) { throw 'Start your Docker engine, then run this command again.' }
        Write-Host 'Starting Docker Desktop...'
        Start-Process -FilePath $restartDesktop -WindowStyle Hidden
        $restartDeadline = (Get-Date).AddSeconds(180)
        do {
            Start-Sleep -Seconds 3
            $restartEngineReady = Test-RestartDocker 'info --format {{.ServerVersion}}'
            if ($restartEngineReady) { break }
        } while ((Get-Date) -lt $restartDeadline)
        if (-not $restartEngineReady) { throw 'Docker did not become ready. Open Docker Desktop to inspect its startup error.' }
    }
    if ((Test-RestartDocker 'image inspect --format {{.Id}} ai-soc-prototype-ollama:latest') -or (Test-Path -LiteralPath $restartHostModels)) {
        $restartCompose += @('-f', (Join-Path $restartRoot 'compose.ollama.yaml'))
        if (Test-Path -LiteralPath $restartHostModels) { $restartCompose += @('-f', $restartHostModels) }
    }
    if ($restartExpectedGoogle) { $restartCompose += @('-f', $restartGoogle) }
    & $restartDocker @restartCompose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Saved Compose configuration is invalid; services were not restarted.' }
    if ($Build) {
        & $restartDocker @restartCompose build api worker
        if ($LASTEXITCODE -ne 0) { throw 'Application build failed; existing services were not restarted.' }
    }
    Write-Host 'Restarting SentinelSME services. Existing database and model volumes are preserved.'
    & $restartDocker @restartCompose up --wait --wait-timeout 240 --force-recreate --no-build
    if ($LASTEXITCODE -ne 0) { throw 'A service failed to start. Review the service error above; saved volumes were preserved.' }
    $restartUrl = "http://127.0.0.1:$Port"
    $restartReady = Invoke-RestMethod "$restartUrl/health/ready" -TimeoutSec 15
    if ($restartReady.status -ne 'ok') { throw 'The API is not ready.' }
    $restartSession = Invoke-RestMethod "$restartUrl/api/v1/auth/session" -TimeoutSec 15
    if ($restartExpectedGoogle -and ($restartSession.mode -ne 'google' -or -not $restartSession.configured)) {
        throw 'Services started, but saved Google sign-in configuration is not ready.'
    }
    Write-Host "SentinelSME is ready: $restartUrl"
    if (-not $NoBrowser) { Start-Process $restartUrl }
} finally {
    $env:AI_SOC_PORT = $restartOldPort
    $env:AI_SOC_ENV_FILE = $restartOldEnvFile
    Pop-Location
}
