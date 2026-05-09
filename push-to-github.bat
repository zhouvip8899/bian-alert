@echo off
cd /d C:\Users\Administrator\Desktop\bian-alert-backup-20260427-094622

echo ===============================================
echo GitHub 代码推送脚本
echo ===============================================
echo.

REM 获取 Git 用户名作为参考
echo 您的 Git 用户名: %USERNAME%
echo.

set /p GITHUB_USER="请输入您的 GitHub 用户名 (直接回车使用 %USERNAME%): "
if "%GITHUB_USER%"=="" set GITHUB_USER=%USERNAME%

echo 使用 GitHub 用户名: %GITHUB_USER%
echo.

REM 初始化仓库（如果尚未初始化）
if not exist .git (
    echo [1/7] 初始化 Git 仓库...
    git init
) else (
    echo [1/7] Git 仓库已存在，跳过初始化
)

REM 设置 remote "bian"
echo [2/7] 设置 remote "bian" 指向 bian-alert 仓库...
git remote remove bian 2>nul
set /p GITHUB_TOKEN="请输入 GitHub Personal Access Token: "
git remote add bian https://%GITHUB_TOKEN%@github.com/%GITHUB_USER%/bian-alert.git
echo [3/7] 设置 remote "binance" 指向 binance-alert 仓库...
git remote remove binance 2>nul
git remote add binance https://%GITHUB_TOKEN%@github.com/%GITHUB_USER%/binance-alert.git

REM 查看 remote 配置
echo [4/7] 当前 Remote 配置:
git remote -v
echo.

REM 添加文件并提交
echo [5/7] 添加文件并提交...
git add -A
git commit -m "pro-kline: WS多代理轮询 + 自动加载 + symbol校验"

REM Push 到 bian-alert
echo [6/7] Push 到 bian-alert 仓库...
git push -u bian main

REM Push 到 binance-alert
echo [7/7] Push 到 binance-alert 仓库...
git push -u binance main

echo.
echo ===============================================
echo 完成！代码已推送到两个仓库。
echo ===============================================
pause
