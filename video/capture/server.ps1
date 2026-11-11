# Restart the recording copy on :3000. Usage: server.ps1 -Mode prod|local [-Build]
param([ValidateSet("prod","local")][string]$Mode = "prod", [switch]$Build)
$rec = "D:\agentshelf-rec"
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
  if ($p.CommandLine -like "*agentshelf-rec*") { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false }
}
$url = if ($Mode -eq "prod") { "https://agentshelf-jade.vercel.app" } else { "http://localhost:3000" }
$envFile = Join-Path $rec ".env.local"
(Get-Content $envFile) -replace '^APP_URL=.*', "APP_URL=$url" | Set-Content -Encoding utf8 $envFile
Set-Location $rec
if ($Build) { pnpm build | Select-Object -Last 2 }
Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c pnpm start -p 3000 > `"$env:TEMP\rec-server.log`" 2>&1" -WorkingDirectory $rec
for ($i = 0; $i -lt 40; $i++) { try { Invoke-WebRequest -UseBasicParsing http://localhost:3000/ -TimeoutSec 2 | Out-Null; "ready ($Mode)"; break } catch { Start-Sleep -Milliseconds 500 } }
