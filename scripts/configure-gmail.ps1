param(
    [string]$ClientId,
    [string]$CredentialsFile,
    [string]$RedirectUri = 'http://127.0.0.1:5173/api/v1/gmail/callback',
    [string]$DataDirectory = (Join-Path $env:LOCALAPPDATA 'SentinelSME'),
    [switch]$EnableSignIn,
    [string[]]$InvitedEmails = @(),
    [string]$LoginRedirectUri = 'http://127.0.0.1:5173/api/v1/auth/callback',
    [switch]$StartApi,
    [switch]$Background
)

$ErrorActionPreference = 'Stop'
$gmailSecretPointer = [IntPtr]::Zero
$gmailImported = $null
try {
    if ($Background -and -not $StartApi) { throw 'Use -StartApi with -Background.' }
    if ($EnableSignIn -and $InvitedEmails.Count -eq 0) { throw 'Provide -InvitedEmails when enabling invited Google sign-in.' }
    if ($EnableSignIn -and @($InvitedEmails | Where-Object { $_ -notmatch '^[^\s@]+@[^\s@]+$' }).Count -gt 0) { throw 'Each invitation must be a complete email address.' }
    if ($CredentialsFile) {
        try { $gmailImported = [IO.File]::ReadAllText([IO.Path]::GetFullPath($CredentialsFile)) | ConvertFrom-Json -ErrorAction Stop }
        catch { throw 'The Google credentials JSON could not be read. Choose the downloaded Web client JSON.' }
        if (-not $gmailImported.web -or -not ($gmailImported.web.client_id -is [string]) -or -not $gmailImported.web.client_id -or -not ($gmailImported.web.client_secret -is [string]) -or -not $gmailImported.web.client_secret) {
            throw 'The file must contain a Google Web OAuth client ID and secret.'
        }
        if ($gmailImported.web.redirect_uris -notcontains $RedirectUri) {
            throw 'The downloaded client does not include the configured callback URI.'
        }
        $env:AI_SOC_GOOGLE_CLIENT_ID = $gmailImported.web.client_id
        $env:AI_SOC_GOOGLE_CLIENT_SECRET = $gmailImported.web.client_secret
    } else {
        if (-not $ClientId) { $ClientId = Read-Host 'Google Web OAuth client ID' }
        $gmailClientSecret = Read-Host 'Google OAuth client secret (hidden)' -AsSecureString
        $gmailSecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($gmailClientSecret)
        $env:AI_SOC_GOOGLE_CLIENT_ID = $ClientId
        $env:AI_SOC_GOOGLE_CLIENT_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($gmailSecretPointer)
    }
    $env:AI_SOC_GOOGLE_REDIRECT_URI = $RedirectUri
    if ($EnableSignIn) {
        $env:AI_SOC_AUTH_MODE = 'google'
        $env:AI_SOC_INVITED_EMAILS = ($InvitedEmails | ForEach-Object { $_.Trim().ToLowerInvariant() }) -join ','
        $env:AI_SOC_GOOGLE_LOGIN_REDIRECT_URI = $LoginRedirectUri
    } else {
        $env:AI_SOC_AUTH_MODE = 'local'
        Remove-Item Env:AI_SOC_INVITED_EMAILS -ErrorAction SilentlyContinue
        Remove-Item Env:AI_SOC_GOOGLE_LOGIN_REDIRECT_URI -ErrorAction SilentlyContinue
    }
    $gmailKeyDirectory = [IO.Path]::GetFullPath($DataDirectory)
    $gmailRepository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    if ($gmailKeyDirectory -eq $gmailRepository -or $gmailKeyDirectory.StartsWith($gmailRepository + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Gmail trial data and encryption keys must be stored outside the repository.'
    }
    New-Item -ItemType Directory -Path $gmailKeyDirectory -Force | Out-Null
    $gmailUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    # Construct a DACL only. Reading and reapplying an existing descriptor can
    # include audit information requiring SeSecurityPrivilege on some hosts.
    $gmailDirectoryAcl = New-Object Security.AccessControl.DirectorySecurity
    $gmailDirectoryAcl.SetAccessRuleProtection($true, $false)
    $gmailDirectoryRule = New-Object Security.AccessControl.FileSystemAccessRule($gmailUser, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $gmailDirectoryAcl.SetAccessRule($gmailDirectoryRule)
    $gmailDirectoryInfo = [IO.DirectoryInfo]::new($gmailKeyDirectory)
    if ($PSVersionTable.PSEdition -eq 'Core') {
        [IO.FileSystemAclExtensions]::SetAccessControl($gmailDirectoryInfo, $gmailDirectoryAcl)
    } else {
        $gmailDirectoryInfo.SetAccessControl($gmailDirectoryAcl)
    }
    $gmailKeyPath = Join-Path $gmailKeyDirectory 'token.key'
    if (-not (Test-Path -LiteralPath $gmailKeyPath)) {
        $gmailRandomBytes = New-Object byte[] 32
        $gmailRng = [Security.Cryptography.RandomNumberGenerator]::Create()
        $gmailRng.GetBytes($gmailRandomBytes)
        $gmailRng.Dispose()
        $gmailEncryptionKey = [Convert]::ToBase64String($gmailRandomBytes).Replace('+', '-').Replace('/', '_')
        [IO.File]::WriteAllText($gmailKeyPath, $gmailEncryptionKey, [Text.Encoding]::ASCII)
    }
    $gmailKeyAcl = New-Object Security.AccessControl.FileSecurity
    $gmailKeyAcl.SetAccessRuleProtection($true, $false)
    $gmailKeyRule = New-Object Security.AccessControl.FileSystemAccessRule($gmailUser, 'FullControl', 'Allow')
    $gmailKeyAcl.SetAccessRule($gmailKeyRule)
    $gmailKeyInfo = [IO.FileInfo]::new($gmailKeyPath)
    if ($PSVersionTable.PSEdition -eq 'Core') {
        [IO.FileSystemAclExtensions]::SetAccessControl($gmailKeyInfo, $gmailKeyAcl)
    } else {
        $gmailKeyInfo.SetAccessControl($gmailKeyAcl)
    }
    $env:AI_SOC_TOKEN_KEY_FILE = $gmailKeyPath
    $gmailTrialDatabase = (Join-Path $gmailKeyDirectory 'trial.db').Replace('\', '/')
    $env:AI_SOC_DATABASE_URL = 'sqlite:///' + $gmailTrialDatabase
    Write-Host 'Gmail configured for this session. No credentials were copied into the project.'
    Write-Host 'Private trial data is stored outside the project under your local application data folder.'
    if ($EnableSignIn) { Write-Host 'Invited Google sign-in enabled. Every user receives a separate server-assigned workspace.' }
    if (-not $StartApi) { Write-Host 'Start the API in this terminal with: uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log' }
} finally {
    if ($gmailSecretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($gmailSecretPointer) }
    $gmailImported = $null
}

if ($StartApi) {
    $gmailProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $gmailExpectedPython = Join-Path $gmailProjectRoot '.venv\Scripts\python.exe'
    $gmailCommandPattern = '^"?' + [regex]::Escape($gmailExpectedPython) + '("|\s)'
    $gmailListeners = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)
    foreach ($gmailListener in $gmailListeners) {
        $gmailApiProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $gmailListener.OwningProcess)
        if ($gmailApiProcess.CommandLine -notmatch $gmailCommandPattern -or $gmailApiProcess.CommandLine -notmatch 'uvicorn.*app\.main:app') {
            throw 'Port 8000 belongs to another application. Stop it yourself or choose another port.'
        }
    }
    foreach ($gmailListener in $gmailListeners) {
        $gmailApiProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $gmailListener.OwningProcess)
        $gmailApiParent = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $gmailApiProcess.ParentProcessId)
        if ($gmailApiParent.CommandLine -match $gmailCommandPattern -and $gmailApiParent.CommandLine -match 'uvicorn.*app\.main:app') {
            Stop-Process -Id $gmailApiParent.ProcessId -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $gmailApiProcess.ProcessId -ErrorAction SilentlyContinue
    }
    Push-Location $gmailProjectRoot
    try {
        if ($Background) {
            $gmailApiLog = Join-Path $gmailKeyDirectory 'api.stdout.log'
            $gmailApiErrors = Join-Path $gmailKeyDirectory 'api.stderr.log'
            $gmailStartedApi = Start-Process -FilePath $gmailExpectedPython -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--no-access-log' -WorkingDirectory $gmailProjectRoot -WindowStyle Hidden -RedirectStandardOutput $gmailApiLog -RedirectStandardError $gmailApiErrors -PassThru
            Write-Host ('Configured local API started. Process ID: ' + $gmailStartedApi.Id)
        } else {
            uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
        }
    }
    finally { Pop-Location }
}
