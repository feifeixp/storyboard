# 启动开发服务器（使用代理）
# 使用方法：在 PowerShell 中执行 .\start-with-proxy.ps1

# 设置代理（v2rayN 本地监听端口 10808）
$env:HTTP_PROXY="http://127.0.0.1:10808"
$env:HTTPS_PROXY="http://127.0.0.1:10808"

Write-Host "✅ 已配置代理: http://127.0.0.1:10808" -ForegroundColor Green

# 启动开发服务器
npm run dev

