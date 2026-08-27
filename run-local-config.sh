#!/bin/bash

# DodoGuard 本地配置文件运行脚本
# 使用方法: ./run-local-config.sh [配置文件路径] [报告目录]

set -e

# 配置
CONFIG_PATH="${1:-$HOME/my-configs/pentest-config.yaml}"
REPORTS_DIR="${2:-$HOME/my-reports}"
IMAGE_NAME="dodoguard:0.119.0"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🚀 DodoGuard 渗透测试 - 本地配置文件运行${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# 检查配置文件
if [ ! -f "$CONFIG_PATH" ]; then
    echo -e "${RED}❌ 配置文件不存在: $CONFIG_PATH${NC}"
    echo ""
    echo "使用方法:"
    echo "  $0 [配置文件路径] [报告目录]"
    echo ""
    echo "示例:"
    echo "  $0 ~/Desktop/my-config.yaml ~/Desktop/reports"
    echo "  $0 configs/dify-pentest-v3-only-custom.yaml ./reports"
    exit 1
fi

# 创建报告目录
mkdir -p "$REPORTS_DIR"

# 获取配置文件名和目录
CONFIG_FILE=$(basename "$CONFIG_PATH")
CONFIG_DIR=$(dirname "$CONFIG_PATH")

echo -e "${YELLOW}📋 配置文件:${NC} $CONFIG_PATH"
echo -e "${YELLOW}📁 报告目录:${NC} $REPORTS_DIR"
echo -e "${YELLOW}🐳 镜像名称:${NC} $IMAGE_NAME"
echo ""

# 检查镜像是否存在
if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo -e "${RED}❌ 镜像不存在: $IMAGE_NAME${NC}"
    echo "请先构建镜像: docker build -t $IMAGE_NAME ."
    exit 1
fi

echo -e "${GREEN}🔍 开始运行渗透测试...${NC}"
echo ""

# 运行测试
docker run --rm \
  -v "$CONFIG_DIR:/app/user-configs" \
  -v "$REPORTS_DIR:/app/reports" \
  "$IMAGE_NAME" \
  dodoguard dify-pentest "/app/user-configs/$CONFIG_FILE" \
  --output /app/reports \
  --verbose

# 检查结果
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
if [ -d "$REPORTS_DIR" ] && [ "$(ls -A $REPORTS_DIR 2>/dev/null)" ]; then
    echo -e "${GREEN}✅ 测试完成！报告已保存到:${NC}"
    echo ""
    ls -lh "$REPORTS_DIR" | tail -10
    echo ""
    
    # 显示最新报告
    LATEST_REPORT=$(ls -t "$REPORTS_DIR"/*.md 2>/dev/null | head -1)
    if [ -n "$LATEST_REPORT" ]; then
        echo -e "${GREEN}📄 最新报告:${NC}"
        echo "   $LATEST_REPORT"
        echo ""
        echo -e "${YELLOW}查看报告:${NC}"
        echo "   cat $LATEST_REPORT"
        echo "   或"
        echo "   open $LATEST_REPORT"
    fi
else
    echo -e "${YELLOW}⚠️  未找到报告文件${NC}"
    echo "请检查："
    echo "  1. 配置文件是否正确"
    echo "  2. 是否有网络连接访问目标 API"
    echo "  3. 查看上面的错误信息"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ 完成！${NC}"

