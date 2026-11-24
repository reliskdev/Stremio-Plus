# Stremio+ installer for Windows. Installs (or updates) the latest release. In PowerShell:
#
#   irm https://raw.githubusercontent.com/reliskdev/Stremio-Plus/main/install.ps1 | iex
#
# Needs the official Stremio app (Stremio 5). Uses your Node.js if it is 20+, otherwise downloads a private copy.
# Env overrides: STREMIO_PLUS_DIR (install folder), STREMIO_PLUS_URL (release tarball, or a local path).
& {
    # Scoped to this block: `irm | iex` runs in the caller's session, whose preferences we shouldn't change.
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is many times slower with its progress bar
    $Repo = 'reliskdev/Stremio-Plus'
    $NodeVersion = 'v22.12.0'
    $Url = if ($env:STREMIO_PLUS_URL) { $env:STREMIO_PLUS_URL } else { "https://github.com/$Repo/releases/latest/download/stremio-plus.tar.gz" }
    $Dir = if ($env:STREMIO_PLUS_DIR) { $env:STREMIO_PLUS_DIR } else { Join-Path $env:LOCALAPPDATA 'Stremio-Plus' }
    $Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw 'tar.exe is missing (it ships with Windows 10 1803 and later).' }

    $Tmp = Join-Path ([IO.Path]::GetTempPath()) ('stremio-plus-' + [guid]::NewGuid())
    New-Item -ItemType Directory $Tmp | Out-Null
    try {
        Write-Host 'Downloading Stremio+...' -ForegroundColor Cyan
        if (Test-Path $Url) { Copy-Item $Url "$Tmp\sp.tar.gz" } else { Invoke-WebRequest $Url -OutFile "$Tmp\sp.tar.gz" -UseBasicParsing }
        tar.exe -xzf "$Tmp\sp.tar.gz" -C $Tmp
        if ($LASTEXITCODE) { throw 'Could not extract the download.' }
        $New = Join-Path $Tmp 'stremio-plus'
        if (-not (Test-Path "$New\cli\index.js")) { throw "The download doesn't look like a Stremio+ release." }

        $nodeOk = $false
        try {
            $major = & node -p "process.versions.node.split('.')[0]" 2>$null
            if ([int]$major -ge 20) { $nodeOk = $true }
        } catch {}
        if (-not (Test-Path "$Dir\runtime\node\node.exe") -and -not $nodeOk) {
            Write-Host "Downloading Node.js $NodeVersion (private copy, used only by Stremio+)..." -ForegroundColor Cyan
            $zip = "node-$NodeVersion-win-$Arch"
            Invoke-WebRequest "https://nodejs.org/dist/$NodeVersion/$zip.zip" -OutFile "$Tmp\node.zip" -UseBasicParsing
            Expand-Archive "$Tmp\node.zip" "$Tmp\node"
            New-Item -ItemType Directory "$New\runtime" | Out-Null
            Move-Item "$Tmp\node\$zip" "$New\runtime\node"
        }

        # Update in place: stop the running copy, keep caches and settings (addon\data) and the private Node.
        if (Test-Path $Dir) {
            Write-Host "Updating $Dir..." -ForegroundColor Cyan
            if (Test-Path "$Dir\bin\stremio-plus.cmd") { try { & "$Dir\bin\stremio-plus.cmd" halt *> $null } catch {} }
            if (Test-Path "$Dir\addon\data") { Move-Item "$Dir\addon\data" "$New\addon\data" }
            if ((Test-Path "$Dir\runtime") -and -not (Test-Path "$New\runtime")) { Move-Item "$Dir\runtime" "$New\runtime" }
            Remove-Item $Dir -Recurse -Force
        }
        New-Item -ItemType Directory (Split-Path $Dir) -Force | Out-Null
        Move-Item $New $Dir

        & "$Dir\bin\stremio-plus.cmd" setup
        if ($LASTEXITCODE) { throw 'Setup failed (see above).' }

        # `stremio-plus` on the user PATH (new terminals).
        $bin = "$Dir\bin"
        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        if (-not $userPath) { $userPath = '' }
        if (($userPath -split ';') -notcontains $bin) {
            [Environment]::SetEnvironmentVariable('Path', (($userPath.TrimEnd(';') + ';' + $bin).TrimStart(';')), 'User')
        }

        $version = & "$Dir\bin\stremio-plus.cmd" version
        Write-Host ''
        Write-Host "Stremio+ $version is installed in $Dir" -ForegroundColor Green
        Write-Host 'Open it with the Stremio+ shortcut on your desktop or in the Start menu.'
        Write-Host 'First run: log in to your Stremio account once, then add the Rotten Tomatoes addon from'
        Write-Host '  http://127.0.0.1:7010/configure'
        Write-Host 'Always open Stremio with the mods: stremio-plus enable   -   Uninstall: stremio-plus uninstall'
    } finally {
        Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
