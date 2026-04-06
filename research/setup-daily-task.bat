@echo off
REM Creates a Windows Task Scheduler task to run daily-refresh.sh at 6 AM ET
REM Run this ONCE as administrator: right-click → Run as administrator

schtasks /create /tn "Swish Daily Refresh" /tr "bash \"C:\Users\scott\Desktop\swish\research\daily-refresh.sh\"" /sc daily /st 06:00 /f

echo.
echo Task "Swish Daily Refresh" created — runs daily at 6:00 AM.
echo It will collect fresh NBA data, retrain weights, and auto-deploy.
echo.
echo To check: schtasks /query /tn "Swish Daily Refresh"
echo To delete: schtasks /delete /tn "Swish Daily Refresh" /f
echo To run now: schtasks /run /tn "Swish Daily Refresh"
pause
