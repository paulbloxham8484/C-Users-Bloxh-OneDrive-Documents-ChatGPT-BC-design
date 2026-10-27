$ErrorActionPreference = 'Stop'
$expoProject = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $expoProject
$env:EAS_NO_VCS = '1'
$env:EAS_PROJECT_ROOT = $expoProject
$Host.UI.RawUI.WindowTitle = 'BC Design - Apple signing setup'
Write-Host 'BC Design: Apple production signing setup' -ForegroundColor Green
Write-Host 'Enter your Apple ID, password and verification code in this window only.'
Write-Host 'This script records only the command result, never your credentials.'
Write-Host ''
& eas credentials:configure-build --platform ios --profile production
$setupExitCode = $LASTEXITCODE
$record = [ordered]@{
    platform = 'ios'
    profile = 'production'
    bundleIdentifier = 'com.bloxham.bcdesign'
    completedAt = [DateTime]::UtcNow.ToString('o')
    exitCode = $setupExitCode
    configured = ($setupExitCode -eq 0)
}
$record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $expoProject '../test-results/ios-signing-setup.json') -Encoding utf8
if ($setupExitCode -eq 0) {
    Write-Host 'Signing setup completed. You can return to Codex.' -ForegroundColor Green
} else {
    Write-Host 'Signing setup did not complete. Return to Codex with the error description.' -ForegroundColor Yellow
}
