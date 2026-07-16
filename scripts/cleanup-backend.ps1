# ============================================================
# BLS-KOX 后端清理脚本
# 用途：删除 Koa 后端 或 Java 后端，保留其中一套即可
# 用法：.\scripts\cleanup-backend.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BLS-KOX 后端清理工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "当前项目包含两套后端：" -ForegroundColor Yellow
Write-Host "  1. bls-server       (Koa / TypeScript) - 端口 7001" -ForegroundColor Gray
Write-Host "  2. bls-java-server  (Spring Boot / Java) - 端口 8080" -ForegroundColor Gray
Write-Host ""

Write-Host "请选择要删除的后端：" -ForegroundColor White
Write-Host "  [K] 删除 Koa 后端 (bls-server)" -ForegroundColor Red
Write-Host "  [J] 删除 Java 后端 (bls-java-server)" -ForegroundColor Red
Write-Host "  [C] 取消" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "请输入 K / J / C"

switch ($choice.ToUpper()) {
    "K" {
        $target = "bls-server"
        $targetName = "Koa 后端"
        $port = "7001"
        $otherName = "Java 后端 (bls-java-server)"
        $otherPort = "8080"
    }
    "J" {
        $target = "bls-java-server"
        $targetName = "Java 后端"
        $port = "8080"
        $otherName = "Koa 后端 (bls-server)"
        $otherPort = "7001"
    }
    default {
        Write-Host "已取消。" -ForegroundColor Gray
        exit 0
    }
}

Write-Host ""
Write-Host "即将删除: $targetName ($target)" -ForegroundColor Red
Write-Host "将保留: $otherName" -ForegroundColor Green
Write-Host ""

$confirm = Read-Host "确认删除？请输入 yes 继续"
if ($confirm -ne "yes") {
    Write-Host "已取消。" -ForegroundColor Gray
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  开始清理..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ---- 1. 删除后端目录 ----
$targetPath = Join-Path $RootDir $target
if (Test-Path $targetPath) {
    Write-Host "[1/5] 删除目录: $target" -ForegroundColor Yellow
    Remove-Item -Path $targetPath -Recurse -Force
    Write-Host "      已删除 $targetPath" -ForegroundColor Green
} else {
    Write-Host "[1/5] 目录 $target 不存在，跳过" -ForegroundColor Gray
}

# ---- 2. 更新 docker-compose.yml ----
$dcPath = Join-Path $RootDir "docker-compose.yml"
if (Test-Path $dcPath) {
    Write-Host "[2/5] 更新 docker-compose.yml" -ForegroundColor Yellow
    $dcContent = Get-Content $dcPath -Raw

    if ($target -eq "bls-java-server") {
        # 删除整个 bls-java-server 服务定义块
        $dcContent = $dcContent -replace "(?ms)^\s{2}bls-java-server:.*?(?=^\S|\z)", ""
        # 删除 profiles 相关注释块
        $dcContent = $dcContent -replace "(?ms)^  # Java .*?\n(  #.*?\n)*", ""
    }

    if ($target -eq "bls-server") {
        # 删除整个 bls-server 服务定义块
        $dcContent = $dcContent -replace "(?ms)^\s{2}bls-server:.*?(?=^\S|\z)", ""
        # 删除 bls-nginx depends_on 中对 bls-server 的引用
        $dcContent = $dcContent -replace "^\s+- bls-server\s*\n", ""
    }

    # 清理多余空行
    $dcContent = $dcContent -replace "\n{3,}", "`n`n"
    Set-Content -Path $dcPath -Value $dcContent -NoNewline
    Write-Host "      已更新 docker-compose.yml" -ForegroundColor Green
}

# ---- 3. 更新 nginx.conf ----
$nginxPath = Join-Path $RootDir "nginx.conf"
if (Test-Path $nginxPath) {
    Write-Host "[3/5] 更新 nginx.conf" -ForegroundColor Yellow

    if ($target -eq "bls-server") {
        # Koa 被删，启用 Java upstream，修改 proxy_pass
        $nginxContent = Get-Content $nginxPath -Raw
        # 取消注释 Java upstream
        $nginxContent = $nginxContent -replace "#\s*upstream\s+java_backend\s*\{", "upstream java_backend {"
        $nginxContent = $nginxContent -replace "#\s*server\s+bls-java-server:8080;", "    server bls-java-server:8080;"
        $nginxContent = $nginxContent -replace "#\s*\}", "}"
        # 修改 proxy_pass 指向 Java
        $nginxContent = $nginxContent -replace "proxy_pass\s+http://bls-server:7001;", "proxy_pass http://bls-java-server:8080;"
        $nginxContent = $nginxContent -replace "proxy_pass\s+http://koa_backend;", "proxy_pass http://java_backend;"
        # 删除 Koa upstream
        $nginxContent = $nginxContent -replace "(?ms)upstream\s+koa_backend\s*\{[^}]*\}", ""
        Set-Content -Path $nginxPath -Value $nginxContent -NoNewline
        Write-Host "      已将 nginx 代理切换至 bls-java-server:8080" -ForegroundColor Green
    } else {
        Write-Host "      nginx.conf 默认指向 Koa，无需修改" -ForegroundColor Gray
    }
}

# ---- 4. 更新 bls-admin-nginx.conf ----
$adminNginxPath = Join-Path $RootDir "bls-admin-nginx.conf"
if (Test-Path $adminNginxPath) {
    Write-Host "[4/5] 更新 bls-admin-nginx.conf" -ForegroundColor Yellow

    if ($target -eq "bls-server") {
        $adminNginxContent = Get-Content $adminNginxPath -Raw
        $adminNginxContent = $adminNginxContent -replace "http://bls-server:7001", "http://bls-java-server:8080"
        Set-Content -Path $adminNginxPath -Value $adminNginxContent -NoNewline
        Write-Host "      已将前端 nginx 代理切换至 bls-java-server:8080" -ForegroundColor Green
    } else {
        Write-Host "      无需修改" -ForegroundColor Gray
    }
}

# ---- 5. 清理相关文档 ----
Write-Host "[5/5] 清理相关文档" -ForegroundColor Yellow

$docMap = @{
    "bls-server"      = @("docs/backend-koa.md")
    "bls-java-server" = @("docs/backend-java.md", "docs/api-compatibility.md")
}

if ($docMap.ContainsKey($target)) {
    foreach ($doc in $docMap[$target]) {
        $docPath = Join-Path $RootDir $doc
        if (Test-Path $docPath) {
            Remove-Item -Path $docPath -Force
            Write-Host "      已删除文档: $doc" -ForegroundColor Gray
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  清理完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "已删除: $targetName" -ForegroundColor Red
Write-Host "已保留: $otherName" -ForegroundColor Green
Write-Host ""
Write-Host "后续步骤：" -ForegroundColor White
Write-Host "  1. 检查 nginx.conf 和 docker-compose.yml 是否正确" -ForegroundColor Gray
Write-Host "  2. git add -A && git commit -m 'chore: remove $target'" -ForegroundColor Gray
Write-Host "  3. 如果使用 Docker: docker compose up -d" -ForegroundColor Gray
Write-Host "  4. 如果本地开发: 确认前端 proxy 指向正确端口 ($otherPort)" -ForegroundColor Gray
