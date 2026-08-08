$ErrorActionPreference = "SilentlyContinue"

function Stop-PortListeners([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      Write-Host "Stopping PID $_ (port $Port)"
      Stop-Process -Id $_ -Force
    }
}

function Stop-DemoNodeProcesses {
  Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine -match 'dpdpos_backend' -or
        $_.CommandLine -match 'tsx watch src/server' -or
        $_.CommandLine -match 'tsx watch src/worker' -or
        $_.CommandLine -match 'tsx src/server' -or
        $_.CommandLine -match 'tsx src/worker'
      )
    } |
    ForEach-Object {
      Write-Host "Stopping node PID $($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force
    }
}

Stop-PortListeners -Port 3000
Stop-DemoNodeProcesses
Start-Sleep -Seconds 1
Write-Host "Done stopping demo services."
