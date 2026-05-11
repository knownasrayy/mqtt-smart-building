$ErrorActionPreference = "Continue"

Write-Output "Stopping background processes..."

$files = @("mosquitto.pid", "alert.pid", "dashSub.pid", "pubLingkungan.pid", "pubKeamanan.pid", "pubEnergi.pid", "flask.pid")

foreach ($file in $files) {
    if (Test-Path $file) {
        $pid_val = Get-Content $file
        if ($pid_val) {
            Write-Output "Stopping PID $pid_val from $file"
            Stop-Process -Id $pid_val -Force -ErrorAction SilentlyContinue
        }
        Remove-Item $file
    }
}

Write-Output "Cleanup complete."
