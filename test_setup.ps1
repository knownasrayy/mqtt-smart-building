$ErrorActionPreference = "Continue"

Write-Output "Starting Mosquitto..."
$mosquittoProc = Start-Process -FilePath "C:\Program Files\mosquitto\mosquitto.exe" -ArgumentList "-v -c broker/mosquitto.conf" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

Write-Output "Starting Subscribers..."
$alertProc = Start-Process -FilePath "python" -ArgumentList "subscribers/alert_engine.py" -PassThru -WindowStyle Hidden
$dashSubProc = Start-Process -FilePath "python" -ArgumentList "subscribers/dashboard_subscriber.py" -PassThru -WindowStyle Hidden

Write-Output "Starting Publishers..."
$pubLingkunganProc = Start-Process -FilePath "python" -ArgumentList "publishers/sensor_lingkungan.py" -PassThru -WindowStyle Hidden
$pubKeamananProc = Start-Process -FilePath "python" -ArgumentList "publishers/sensor_keamanan.py" -PassThru -WindowStyle Hidden
$pubEnergiProc = Start-Process -FilePath "python" -ArgumentList "publishers/sistem_energi.py" -PassThru -WindowStyle Hidden

Write-Output "Starting Flask App..."
$flaskProc = Start-Process -FilePath "python" -ArgumentList "dashboard/app.py" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3

$mosquittoProc.Id | Out-File mosquitto.pid
$alertProc.Id | Out-File alert.pid
$dashSubProc.Id | Out-File dashSub.pid
$pubLingkunganProc.Id | Out-File pubLingkungan.pid
$pubKeamananProc.Id | Out-File pubKeamanan.pid
$pubEnergiProc.Id | Out-File pubEnergi.pid
$flaskProc.Id | Out-File flask.pid

Write-Output "All background processes started. PIDs written to files."
