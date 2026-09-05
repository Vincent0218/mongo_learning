# Run from any directory: ./scripts/verify.ps1
# Prerequisite: both Compose environments initialized and seed imported.
$ErrorActionPreference = 'Stop'
function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
Push-Location (Join-Path $PSScriptRoot '..')
try {
    foreach ($script in @('crud-checks.js', 'aggregation.js', 'indexing.js')) {
        Invoke-Checked 'docker' @('compose', 'exec', '-T', 'mongodb', 'mongosh', '-u', 'admin', '-p', 'password123', '--authenticationDatabase', 'admin', '--quiet', "/examples/$script")
    }
    # UTF-8 output also works when the invoking Windows terminal uses another code page.
    Invoke-Checked 'uv' @('run', '--project', 'examples/python', 'python', '-X', 'utf8', 'examples/python/demo.py')
    Invoke-Checked 'uv' @('run', '--project', 'examples/python', 'python', '-m', 'unittest', 'discover', '-s', 'examples/python', '-v')
    Push-Location 'examples/go'
    try {
        Invoke-Checked 'go' @('run', '.')
        Invoke-Checked 'go' @('test', '-count=1', '-v', './...')
    } finally { Pop-Location }
    Invoke-Checked 'dotnet' @('run', '--project', 'examples/dotnet')
    Invoke-Checked 'dotnet' @('run', '--project', 'examples/dotnet', '--', '--check')
    Invoke-Checked 'uv' @('run', 'mkdocs', 'build', '--strict')
    Write-Host 'Local verification passed. Search, restore drill and browser visual QA are separate.'
} finally { Pop-Location }
