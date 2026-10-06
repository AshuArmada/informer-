[CmdletBinding()]
param(
    [switch]$InstallDependencies
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$python = Join-Path $backend '.venv\Scripts\python.exe'
$processes = @()

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed (exit code $LASTEXITCODE). See the output above."
    }
}

function Wait-Service {
    param([string]$Url, [System.Diagnostics.Process]$Process, [string]$Name)
    $deadline = (Get-Date).AddSeconds(60)
    do {
        if ($Process.HasExited) {
            throw "$Name exited during startup. Check the logs in $root\logs."
        }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch {
            # Retry while the development server is starting.
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    throw "$Name did not become ready within 60 seconds. Check the logs in $root\logs."
}

Push-Location $root
try {
    foreach ($command in @('docker', 'node', 'npm.cmd')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Missing $command. Install the prerequisites listed in README.md."
        }
    }
    Invoke-Checked 'node' @('-e', "const [a,b]=process.versions.node.split('.').map(Number); if (!((a===20 && b>=19) || (a===22 && b>=12) || a>22)) { console.error('Vite requires Node 20.19+ or 22.12+.'); process.exit(1); }")
    $dockerReady = $false
    try {
        & docker info --format '{{.ServerVersion}}' *> $null
        $dockerReady = $LASTEXITCODE -eq 0
    } catch { $dockerReady = $false }
    if (-not $dockerReady) {
        throw 'Docker is not running. Start Docker Desktop, wait until it is ready, and run this script again.'
    }
    Invoke-Checked 'docker' @('compose', 'version')

    foreach ($port in @(8000, 5173)) {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        try { $listener.Start() }
        catch { throw "Port $port is already in use. Stop the existing server and try again." }
        finally { $listener.Stop() }
    }

    $newVenv = -not (Test-Path -LiteralPath $python)
    if ($newVenv) {
        Write-Host 'Creating the Python virtual environment...'
        if (Get-Command py -ErrorAction SilentlyContinue) {
            Invoke-Checked 'py' @('-3', '-m', 'venv', (Join-Path $backend '.venv'))
        } else {
            Invoke-Checked 'python' @('-m', 'venv', (Join-Path $backend '.venv'))
        }
    }
    Invoke-Checked $python @('-c', "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 'Python 3.12+ is required.')")
    & $python -c "import importlib.metadata, sys; sys.exit(0 if any(d.metadata['Name'] == 'informer-backend' for d in importlib.metadata.distributions()) else 1)"
    $needsBackendInstall = $LASTEXITCODE -ne 0
    $backendManifestHash = (Get-FileHash -LiteralPath (Join-Path $backend 'pyproject.toml') -Algorithm SHA256).Hash
    $backendInstallStamp = Join-Path $backend '.venv\informer-dependencies.sha256'
    $backendDependenciesChanged = -not (Test-Path -LiteralPath $backendInstallStamp)
    if (-not $backendDependenciesChanged) {
        $backendDependenciesChanged = ([System.IO.File]::ReadAllText($backendInstallStamp).Trim() -ne $backendManifestHash)
    }
    if ($newVenv -or $needsBackendInstall -or $backendDependenciesChanged -or $InstallDependencies) {
        Write-Host 'Installing backend dependencies...'
        Invoke-Checked $python @('-m', 'pip', 'install', '-e', $backend)
        # Record only successful installs, so interrupted/failed installs retry next time.
        [System.IO.File]::WriteAllText($backendInstallStamp, $backendManifestHash)
    }

    # Only create a key for a new .env. Existing keys protect stored credentials.
    $envPath = Join-Path $backend '.env'
    if (-not (Test-Path -LiteralPath $envPath)) {
        $key = & $python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
        if ($LASTEXITCODE -ne 0) { throw 'Could not generate SECRET_KEY.' }
        $template = [System.IO.File]::ReadAllText((Join-Path $backend '.env.example'))
        $template = $template -replace '(?m)^SECRET_KEY=.*$', "SECRET_KEY=$key"
        [System.IO.File]::WriteAllText($envPath, $template, [System.Text.UTF8Encoding]::new($false))
        Write-Host 'Created backend/.env with a new encryption key.'
    }

    Set-Location $backend
    Invoke-Checked $python @('-c', 'from app.config import get_settings; from cryptography.fernet import Fernet; Fernet(get_settings().secret_key.encode())')

    Set-Location $frontend
    if ($InstallDependencies -or -not (Test-Path 'node_modules/vite/bin/vite.js')) {
        Write-Host 'Installing frontend dependencies...'
        if (Test-Path 'package-lock.json') {
            Invoke-Checked 'npm.cmd' @('ci')
        } else {
            Invoke-Checked 'npm.cmd' @('install')
        }
    }

    Set-Location $root
    Write-Host 'Starting PostgreSQL and Adminer...'
    Invoke-Checked 'docker' @('compose', 'up', '-d', '--wait', '--wait-timeout', '120', 'db', 'adminer')
    Set-Location $backend
    Write-Host 'Applying database migrations...'
    Invoke-Checked $python @('-m', 'alembic', 'upgrade', 'head')

    $logs = Join-Path $root 'logs'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $api = Start-Process -FilePath $python -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'backend.log') -RedirectStandardError (Join-Path $logs 'backend-error.log')
    $processes += $api
    Wait-Service 'http://127.0.0.1:8000/api/health' $api 'Backend'

    $web = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'frontend.log') -RedirectStandardError (Join-Path $logs 'frontend-error.log')
    $processes += $web
    Wait-Service 'http://127.0.0.1:5173' $web 'Frontend'

    Write-Host "`nInformer is ready: http://127.0.0.1:5173"
    Write-Host 'API health: http://127.0.0.1:8000/api/health | Adminer: http://localhost:8080'
    Write-Host "Logs: $logs"
    Write-Host 'Press Ctrl+C to stop the API and frontend. Docker services will keep running.'
    while ($true) {
        foreach ($process in $processes) {
            if ($process.HasExited) { throw 'A server stopped unexpectedly. Check the logs.' }
        }
        Start-Sleep -Seconds 1
    }
} catch {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    foreach ($process in $processes) {
        if (-not $process.HasExited) {
            # Include reload workers and other children, and only stop our own servers.
            & taskkill.exe /PID $process.Id /T /F *> $null
        }
    }
    Pop-Location
}
