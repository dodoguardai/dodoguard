#!/bin/bash

# 修复 DodoGuard 项目权限的脚本
# 使用方法:
#   方式1: sudo bash fix-permissions.sh (会提示输入密码)
#   方式2: echo 'your_password' | sudo -S bash fix-permissions.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
USER=$(whoami)

echo "正在修复项目权限..."
echo "项目目录: $PROJECT_DIR"
echo "用户: $USER"
echo ""

echo "1. 修复项目目录所有权..."
sudo chown -R "$USER:staff" "$PROJECT_DIR"
echo "✓ 项目目录所有权已修复"

echo "2. 修复目录权限..."
sudo find "$PROJECT_DIR" -type d -exec chmod 755 {} \;
echo "✓ 目录权限已修复"

echo "3. 修复文件权限..."
sudo find "$PROJECT_DIR" -type f -exec chmod 644 {} \;
echo "✓ 文件权限已修复"

echo "4. 修复可执行文件权限..."
sudo find "$PROJECT_DIR" -type f \( -name "*.sh" -o -name "*.js" -o -name "*.ts" \) -exec chmod 755 {} \;
echo "✓ 可执行文件权限已修复"

echo "5. 移除扩展属性..."
sudo xattr -rc "$PROJECT_DIR" 2>/dev/null || true
echo "✓ 扩展属性已移除"

if [ -d "$PROJECT_DIR/node_modules" ]; then
    echo "6. 修复 node_modules 权限..."
    sudo chown -R "$USER:staff" "$PROJECT_DIR/node_modules"
    sudo find "$PROJECT_DIR/node_modules" -type d -exec chmod 755 {} \;
    sudo find "$PROJECT_DIR/node_modules" -type f -exec chmod 644 {} \;
    echo "✓ node_modules 权限已修复"
fi

for dir in ".next" "dist" "build" ".cache"; do
    if [ -d "$PROJECT_DIR/$dir" ]; then
        echo "修复 $dir 权限..."
        sudo chown -R "$USER:staff" "$PROJECT_DIR/$dir"
        echo "✓ $dir 权限已修复"
    fi
done

echo ""
echo "=========================================="
echo "权限修复完成！"
echo "现在可以运行 'npm run build' 而不需要 sudo。"
echo "=========================================="
