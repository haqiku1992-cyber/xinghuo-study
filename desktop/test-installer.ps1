$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Installer integration test is only for disposable GitHub Windows runners.' }
$installPath = Join-Path $env:RUNNER_TEMP ('xinghuo-install-' + [guid]::NewGuid())
$dataPath = Join-Path $env:LOCALAPPDATA 'XinghuoStudy'
if (Test-Path -LiteralPath $dataPath) { throw 'Refusing to modify pre-existing user data.' }
New-Item -ItemType Directory -Path $dataPath | Out-Null
$marker = Join-Path $dataPath 'ci-retention.txt'
Set-Content -LiteralPath $marker -Value 'keep-learning-records'
$installer = (Resolve-Path 'release/学习记录-Setup.exe').Path
foreach ($attempt in 1..2) {
  $install = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installPath") -WindowStyle Hidden -PassThru -Wait
  if ($install.ExitCode -ne 0) { throw "Installer exit $($install.ExitCode)" }
  if (!(Test-Path -LiteralPath (Join-Path $installPath '学习记录.exe'))) { throw 'Installed executable missing.' }
  node desktop/test-electron.mjs (Join-Path $installPath '学习记录.exe')
  if ($LASTEXITCODE -ne 0) { throw 'Installed app smoke failed.' }
  if ((Get-Content -LiteralPath $marker) -ne 'keep-learning-records') { throw 'Upgrade changed user data.' }
}
$uninstaller = Join-Path $installPath 'Uninstall 学习记录.exe'
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
if ($uninstall.ExitCode -ne 0) { throw "Uninstaller exit $($uninstall.ExitCode)" }
for ($retry = 0; $retry -lt 30 -and (Test-Path -LiteralPath (Join-Path $installPath '学习记录.exe')); $retry++) { Start-Sleep -Seconds 1 }
if (Test-Path -LiteralPath (Join-Path $installPath '学习记录.exe')) { throw 'Uninstall did not remove the executable.' }
if (!(Test-Path -LiteralPath $marker)) { throw 'Uninstall deleted user data.' }
Write-Output 'NSIS install/reinstall, installed offline app and retained data after uninstall: PASS'
