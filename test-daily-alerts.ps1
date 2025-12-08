# Test Daily Alerts Function
# Replace YOUR_SERVICE_ROLE_KEY with your actual service role key

$serviceRoleKey = "YOUR_SERVICE_ROLE_KEY"
$projectUrl = "https://pvtrcbemeesaebrwhenw.supabase.co"

Write-Host "Testing Daily Alerts Function..." -ForegroundColor Cyan
Write-Host ""

$response = Invoke-RestMethod -Uri "$projectUrl/functions/v1/daily-alerts" `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer $serviceRoleKey"
        "Content-Type" = "application/json"
    } `
    -Body '{}'

Write-Host "Response:" -ForegroundColor Green
$response | ConvertTo-Json -Depth 10

Write-Host ""
Write-Host "Check the response above for:" -ForegroundColor Yellow
Write-Host "- success: true"
Write-Host "- users_processed: number of users"
Write-Host "- alerts_generated: number of alerts created"
Write-Host "- alerts_sent: number of alerts queued"



