#!/bin/bash

# 部署脚本 - Visionary Storyboard Studio
# 用途：自动部署前端和后端到 Cloudflare

set -e  # 遇到错误立即退出

echo "🚀 开始部署 Visionary Storyboard Studio..."
echo ""

# 步骤 1: 构建前端
echo "📦 步骤 1/3: 构建前端..."
npm run build
echo "✅ 前端构建完成"
echo ""

# 步骤 2: 部署后端 API (Cloudflare Workers)
echo "🔧 步骤 2/3: 部署后端 API..."
cd cloudflare
npm run deploy
cd ..
echo "✅ 后端 API 部署完成"
echo ""

# 步骤 3: 部署前端 (Cloudflare Pages)
echo "🌐 步骤 3/3: 部署前端..."
echo ""
echo "⚠️  请手动执行以下命令完成前端部署："
echo ""
echo "   npx wrangler pages deploy dist --project-name=visionary-storyboard-studio"
echo ""
echo "   或者访问 Cloudflare Pages 控制台："
echo "   https://dash.cloudflare.com/pages"
echo ""
echo "   然后："
echo "   1. 连接 GitHub 仓库"
echo "   2. 选择 visionary-storyboard-studio 仓库"
echo "   3. 配置构建设置："
echo "      - Build command: npm run build"
echo "      - Build output directory: dist"
echo "   4. 点击 'Save and Deploy'"
echo ""

echo "🎉 部署脚本执行完成！"
echo ""
echo "📋 部署信息："
echo "   - 后端 API: https://storyboard-api.feifeixp.workers.dev"
echo "   - 前端: 等待 Cloudflare Pages 部署完成"
echo ""

