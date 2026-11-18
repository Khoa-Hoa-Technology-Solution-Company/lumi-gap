[CmdletBinding()]
param(
    [ValidateSet('Start', 'Stop', 'Status')]
    [string]$Action = 'Start',
    [ValidateSet('notifications', 'ai-jobs', 'report', 'gaps', 'embedding', 'paper-analysis', 'manuscript-compile')]
    [string[]]$Workers = @('notifications'),
    [switch]$AiReview,
    [switch]$Compiler,
    [switch]$WatchSharedTypes,
    [switch]$StopInfra
)

# Windows development launcher. No migrations, seeds, installs, or volume deletion.
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$backend = Join-Path $repo 'apps/backend'
$cache = Join-Path $repo '.cache/local-light'
$stateFile = Join-Path $cache 'processes.json'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$node = (Get-Command node -ErrorAction Stop).Source
$docker = (Get-Command docker -ErrorAction Stop).Source
$composeFiles = @('--project-directory', $repo, '-f', (Join-Path $repo 'docker-compose.yml'))

function Quote-Arguments([string[]]$Values) {
    # Start-Process uses Windows command-line quoting; no shell evaluates these values.
    return (($Values | ForEach-Object {
        if ($_ -match '["\r\n]') { throw 'Unsupported character in process argument.' }
        '"' + $_ + '"'
    }) -join ' ')
}

function Invoke-Docker([string[]]$Values, [int]$TimeoutSeconds = 45) {
    $outFile = Join-Path $cache 'docker-command.out.log'
    $errFile = Join-Path $cache 'docker-command.err.log'
    $proc = Start-Process -FilePath $docker -ArgumentList (Quote-Arguments $Values) -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput $outFile -RedirectStandardError $errFile -PassThru
    # PowerShell 5.1 must retain the handle to retrieve fast process exit codes.
    $null = $proc.Handle
    if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
        Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue
        throw "Docker did not respond. Check Docker Desktop. Details: $cache"
    }
    $proc.WaitForExit()
    if ($proc.ExitCode -ne 0) { throw "Docker command failed. Details: $errFile" }
    return @(Get-Content -LiteralPath $outFile -ErrorAction SilentlyContinue)
}

function Read-State {
    if (Test-Path -LiteralPath $stateFile) {
        $parsed = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        foreach ($entry in $parsed) {
            if (-not $entry.ProcessId -or -not $entry.StartTicks -or -not $entry.Name) { throw 'Invalid local process state. Review the local-light state file.' }
            Write-Output $entry
        }
    }
}

function Find-TrackedProcess($Entry) {
    $proc = Get-Process -Id $Entry.ProcessId -ErrorAction SilentlyContinue
    if ($proc -and $proc.Path -eq $node -and $proc.StartTime.ToUniversalTime().Ticks.ToString() -eq $Entry.StartTicks) { return $proc }
    return $null
}

function Stop-TrackedProcesses {
    foreach ($entry in @(Read-State)) {
        $proc = Find-TrackedProcess $entry
        if ($proc) {
            # Kill only the recorded Node process and its own watch-mode children.
            & taskkill.exe /PID $proc.Id /T /F | Out-Null
        }
    }
    '[]' | Set-Content -LiteralPath $stateFile -Encoding UTF8
}

function Show-Status {
    foreach ($entry in @(Read-State)) {
        $proc = Find-TrackedProcess $entry
        if ($proc) { Write-Host ("{0}: running (PID {1})" -f $entry.Name, $proc.Id) }
        else { Write-Host "$($entry.Name): stopped" }
    }
    Write-Host 'Web: http://localhost:8080 | API: http://localhost:4000'
    Write-Host "Logs: $cache"
}

function Start-Node([string]$Name, [string]$Directory, [string[]]$Values) {
    $proc = Start-Process -FilePath $node -ArgumentList (Quote-Arguments $Values) -WorkingDirectory $Directory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $cache "$Name.out.log") -RedirectStandardError (Join-Path $cache "$Name.err.log") -PassThru
    $proc.Refresh()
    $current = @()
    foreach ($old in @(Read-State)) {
        $current += @{ Name = [string]$old.Name; ProcessId = [int]$old.ProcessId; StartTicks = [string]$old.StartTicks }
    }
    $current += @{ Name = $Name; ProcessId = $proc.Id; StartTicks = $proc.StartTime.ToUniversalTime().Ticks.ToString() }
    ConvertTo-Json -InputObject $current -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8
}

function Wait-Http([string]$Url) {
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        try {
            $result = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
            if ($result.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 750
    }
    throw "Service not ready at $Url. Check logs: $cache"
}

$rootDigest = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($repo.ToLowerInvariant()))
$mutexName = 'Local\LumiGapLight-' + ([BitConverter]::ToString($rootDigest).Replace('-', '').Substring(0, 16))
$mutex = [Threading.Mutex]::new($false, $mutexName)
$locked = $false
try {
    $locked = $mutex.WaitOne(0)
    if (-not $locked) { throw 'Another local-light command is running. Wait for it to finish.' }
    if ($Action -eq 'Status') { Show-Status; return }
    if ($Action -eq 'Stop') {
        Stop-TrackedProcesses
        if ($StopInfra) { Invoke-Docker (@('compose') + $composeFiles + @('stop', 'postgres', 'redis')) | Out-Null }
        Write-Host 'Local LumiGap processes stopped. Data and volumes preserved.'
        return
    }

    $rawState = @(Read-State)
    $alive = @($rawState | Where-Object { $null -ne (Find-TrackedProcess $_) })
    if ($alive.Count -gt 0) {
        if ($alive.Count -ne $rawState.Count) {
            Write-Host 'Some services had stopped. Automatically stopping remaining processes to restart cleanly...'
            Stop-TrackedProcesses
        } else {
            Write-Host 'Local mode is already running. Stop it first to change options.'
            Show-Status
            return
        }
    }
    foreach ($required in @('.env', 'node_modules/tsx/dist/cli.mjs', 'node_modules/vite/bin/vite.js', 'apps/backend/src/generated/prisma/client.ts', 'packages/shared-types/dist/index.js')) {
        if (-not (Test-Path -LiteralPath (Join-Path $repo $required))) { throw "Required file missing: $required. See docs/LOCAL_LIGHT_WINDOWS.md." }
    }
    if ($Workers -contains 'manuscript-compile' -and -not $Compiler) { throw 'Use -Compiler to enable the isolated compiler and its worker.' }

    try { Invoke-Docker @('version', '--format', '{{.Server.Version}}') 8 | Out-Null }
    catch {
        $desktop = Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe'
        if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) { Start-Process -FilePath $desktop -WindowStyle Hidden }
        Write-Host 'Waiting for Docker Desktop (only PostgreSQL and Redis are required)...'
        $ready = $false
        for ($attempt = 0; $attempt -lt 12; $attempt++) {
            try { Invoke-Docker @('version', '--format', '{{.Server.Version}}') 5 | Out-Null; $ready = $true; break }
            catch { Start-Sleep -Seconds 2 }
        }
        if (-not $ready) { throw 'Docker Engine is unavailable. Fix Docker Desktop, then run this launcher again. No data was changed.' }
    }

    $services = @('postgres', 'redis')
    if ($AiReview) { $services += 'ai-reviewer' }
    if ($Compiler) { $services += @('manuscript-compiler', 'manuscript-compiler-2025', 'manuscript-compiler-local-relay') }
    $running = Invoke-Docker @('ps', '--filter', 'label=com.docker.compose.project=lumi-gap', '--format', '{{json .}}')
    foreach ($line in $running) {
        $container = $line | ConvertFrom-Json
        $serviceLabel = @($container.Labels -split ',' | Where-Object { $_.StartsWith('com.docker.compose.service=') })
        if ($serviceLabel.Count -ne 1) { throw 'Cannot identify a LumiGap container service safely.' }
        $service = $serviceLabel[0].Substring('com.docker.compose.service='.Length)
        if ($service -notin $services) { Invoke-Docker @('stop', '--time', '15', $container.ID) | Out-Null }
    }
    $files = $composeFiles
    if ($Compiler) { $files += @('-f', (Join-Path $repo 'apps/backend/compiler/compose.yml'), '-f', (Join-Path $PSScriptRoot 'local-light.compose.yml')) }
    Invoke-Docker (@('compose') + $files + @('up', '-d', '--no-deps', '--no-build', '--pull', 'never') + $services) | Out-Null
    if ($Compiler) {
        Wait-Http 'http://127.0.0.1:8020/health'
        Wait-Http 'http://127.0.0.1:8025/health'
    }

    foreach ($port in @(4000, 8080)) {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
        if ($listener) { throw "Port $port is already in use. Stop its existing service before starting local mode." }
    }

    # Child-only overrides; the root .env and production settings are unchanged.
    $env:NODE_ENV = 'development'
    $env:PORT = '4000'
    $env:API_PORT = '4000'
    $env:WEB_PORT = '8080'
    $env:VITE_API_BASE = '/api/v1'
    $env:LOG_LEVEL = 'info'
    $localKeys = Join-Path $backend '.keys/local-light'
    if (Test-Path -LiteralPath (Join-Path $localKeys 'jwt-private.pem')) {
        $env:JWT_PRIVATE_KEY_PATH = Join-Path $localKeys 'jwt-private.pem'
        $env:JWT_PUBLIC_KEY_PATH = Join-Path $localKeys 'jwt-public.pem'
    }
    if ($Compiler) {
        $env:MANUSCRIPT_COMPILER_URL = 'http://127.0.0.1:8020'
        $env:MANUSCRIPT_COMPILER_2025_URL = 'http://127.0.0.1:8025'
        $Workers += 'manuscript-compile'
    }
    if ($AiReview) { $Workers += 'ai-jobs' }

    try {
        if ($WatchSharedTypes) {
            Start-Node 'shared-types' $repo @((Join-Path $repo 'node_modules/typescript/bin/tsc'), '-p', 'packages/shared-types/tsconfig.json', '--watch', '--preserveWatchOutput')
        }
        Start-Node 'backend' $backend @((Join-Path $repo 'node_modules/tsx/dist/cli.mjs'), 'watch', '--clear-screen=false', 'src/server.ts')
        Wait-Http 'http://127.0.0.1:4000/ready'
        Start-Node 'web' (Join-Path $repo 'apps/web') @((Join-Path $repo 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '8080', '--strictPort')
        Wait-Http 'http://127.0.0.1:8080/'
        foreach ($worker in @($Workers | Select-Object -Unique)) {
            $entryPoint = if ($worker -eq 'notifications') { 'notification' } else { $worker }
            Start-Node "worker-$worker" $backend @('--import', 'tsx', "src/workers/$entryPoint.worker.ts")
        }
        Show-Status
        Write-Host 'Source updates now reload directly; Docker image rebuilds are unnecessary.'
    } catch { Stop-TrackedProcesses; throw }
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
