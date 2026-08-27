#!/bin/bash

# Docker 镜像构建脚本 - 自动尝试多个镜像源

MIRRORS=(
    "docker.mirrors.ustc.edu.cn/library/node:22.14.0-alpine"
    "hub-mirror.c.163.com/library/node:22.14.0-alpine"
    "mirror.ccs.tencentyun.com/library/node:22.14.0-alpine"
    "docker.xuanyuan.me/library/node:22.14.0-alpine"
    "docker.1panel.live/library/node:22.14.0-alpine"
    "docker.1ms.run/library/node:22.14.0-alpine"
    "docker.m.daocloud.io/library/node:22.14.0-alpine"
    "node:22.14.0-alpine"
)

echo "🔍 开始尝试不同的镜像源构建 Docker 镜像..."
echo ""

for mirror in "${MIRRORS[@]}"; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "尝试镜像源: $mirror"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 临时修改 Dockerfile
    sed -i.bak "s|^FROM.*AS base|FROM $mirror AS base|" Dockerfile
    
    # 尝试构建（静默模式，只检查退出码）
    if docker build -t dodoguard:0.119.0 . > /tmp/docker-build-attempt.log 2>&1; then
        echo ""
        echo "✅ 构建成功！使用的镜像源: $mirror"
        # 恢复原始 Dockerfile
        mv Dockerfile.bak Dockerfile 2>/dev/null || true
        exit 0
    else
        echo "❌ 镜像源 $mirror 失败"
        cat /tmp/docker-build-attempt.log | grep -i "error" | head -2
        echo ""
        # 恢复 Dockerfile
        mv Dockerfile.bak Dockerfile 2>/dev/null || true
        sleep 1
    fi
done

echo ""
echo "❌ 所有镜像源都失败了，请检查网络连接"
exit 1

