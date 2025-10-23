@echo off
setlocal enabledelayedexpansion

rem Parametres a personnaliser avant d'executer ce script
set "SERVICE_NAME=EosMCP"
set "EXEC_START=C:\\EosMCP\\dist\\bin\\eos-mcp.exe"
set "WORKING_DIRECTORY=C:\\EosMCP"
set "ENVIRONMENT_FILE=C:\\EosMCP\\eos-mcp.env"
set "LOG_DIRECTORY=C:\\EosMCP\\logs"

if "%~1"=="/U" goto uninstall

if not exist "%WORKING_DIRECTORY%" (
  echo Le repertoire %WORKING_DIRECTORY% n'existe pas.
  exit /b 1
)

if not exist "%LOG_DIRECTORY%" mkdir "%LOG_DIRECTORY%"

nssm install %SERVICE_NAME% "%EXEC_START%"
nssm set %SERVICE_NAME% AppDirectory "%WORKING_DIRECTORY%"
nssm set %SERVICE_NAME% AppStdout "%LOG_DIRECTORY%\\eos-mcp-service.log"
nssm set %SERVICE_NAME% AppStderr "%LOG_DIRECTORY%\\eos-mcp-service.log"
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateOnline 1
nssm set %SERVICE_NAME% AppRotateBytes 5242880
if exist "%ENVIRONMENT_FILE%" (
  powershell -NoProfile -Command ^
    "$path = '%ENVIRONMENT_FILE%'; $lines = Get-Content -Path $path; $pairs = @(); foreach ($line in $lines) { if ([string]::IsNullOrWhiteSpace($line)) { continue }; $trimmed = $line.Trim(); if ($trimmed.StartsWith('#')) { continue }; if ($trimmed -match '^(?<key>[^=]+)=(?<value>.*)$') { $pairs += ($matches['key'].Trim() + '=' + $matches['value']); } }; if ($pairs.Count -gt 0) { nssm set '%SERVICE_NAME%' AppEnvironmentExtra ($pairs -join "`r`n") }"
) else (
  echo Avertissement : le fichier d'environnement %ENVIRONMENT_FILE% est introuvable. Les variables ne seront pas injectees.
)
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm start %SERVICE_NAME%

echo Service %SERVICE_NAME% installe et demarre.
exit /b 0

:uninstall
nssm stop %SERVICE_NAME%
nssm remove %SERVICE_NAME% confirm
if exist "%LOG_DIRECTORY%\\eos-mcp-service.log" echo Les journaux sont disponibles dans %LOG_DIRECTORY%.
exit /b 0
