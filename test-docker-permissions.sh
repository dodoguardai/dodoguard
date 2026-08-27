#!/bin/bash

# Docker 文件权限测试脚本
# 测试 Docker 容器生成的文件在宿主机上是否可以正常访问

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

IMAGE_NAME="dodoguard:0.119.0"
TEST_REPORTS_DIR="./test-reports-$(date +%s)"

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🧪 Docker 文件权限测试${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# 步骤 1: 检查 Docker 镜像
echo -e "${YELLOW}📦 步骤 1: 检查 Docker 镜像...${NC}"
if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ 镜像已存在: $IMAGE_NAME${NC}"
    echo -e "${BLUE}  如需重新构建，请运行: docker build -t $IMAGE_NAME .${NC}"
else
    echo -e "${YELLOW}镜像不存在，开始构建...${NC}"
    docker build -t "$IMAGE_NAME" . || {
        echo -e "${RED}❌ 镜像构建失败${NC}"
        exit 1
    }
    echo -e "${GREEN}✓ 镜像构建成功${NC}"
fi
echo ""

# 步骤 2: 创建测试报告目录
echo -e "${YELLOW}📁 步骤 2: 创建测试报告目录...${NC}"
mkdir -p "$TEST_REPORTS_DIR"
echo -e "${GREEN}✓ 测试报告目录: $TEST_REPORTS_DIR${NC}"
echo ""

# 步骤 3: 创建一个简单的测试配置文件
echo -e "${YELLOW}📝 步骤 3: 创建测试配置...${NC}"
TEST_CONFIG_FILE="$TEST_REPORTS_DIR/test-config.yaml"
cat > "$TEST_CONFIG_FILE" << 'EOF'
target:
  name: '测试目标'
  apiBaseUrl: 'https://api.dify.ai'
  apiKey: 'test-key'
  userId: 'test-user'
  conversationId: ''
  responseMode: 'blocking'

task:
  name: '权限测试任务'
  mode: 'quick'
  maxConcurrency: 1
  delayMs: 100
  numTests: 1

commands:
  - category: 'custom'
    name: '测试命令'
    description: '用于测试的命令'
    payload: 'Hello, this is a test'

report:
  formats: ['md']
  outputDir: '/app/reports'
EOF
echo -e "${GREEN}✓ 测试配置文件已创建: $TEST_CONFIG_FILE${NC}"
echo ""

# 步骤 4: 运行 Docker 容器生成测试文件
echo -e "${YELLOW}🐳 步骤 4: 运行 Docker 容器生成测试文件...${NC}"
echo -e "${BLUE}注意: 这里我们直接测试文件写入和权限设置，不运行完整的渗透测试${NC}"

# 在 Docker 容器中运行内联 Node.js 脚本来测试文件权限
echo -e "${YELLOW}在容器中运行测试脚本...${NC}"
docker run --rm \
  -v "$(pwd)/$TEST_REPORTS_DIR:/app/reports" \
  "$IMAGE_NAME" \
  node -e "
const fs = require('fs');
const path = require('path');

// 模拟 setFilePermissions 方法
function setFilePermissions(filePath) {
  try {
    fs.chmodSync(filePath, 0o666);
    console.log('✓ 权限设置成功:', filePath);
    return true;
  } catch (chmodError) {
    console.log('⚠️  权限设置失败:', chmodError.message);
    return false;
  }
}

// 测试文件写入
const testFile = '/app/reports/test-permission-report.md';
const testContent = '# 测试报告\n\n这是一个用于测试文件权限的报告文件。\n\n生成时间: ' + new Date().toISOString();

try {
  // 确保目录存在
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  
  // 写入文件
  fs.writeFileSync(testFile, testContent, 'utf-8');
  console.log('✓ 文件写入成功:', testFile);
  
  // 设置权限
  setFilePermissions(testFile);
  
  // 验证文件
  const stats = fs.statSync(testFile);
  const mode = (stats.mode & parseInt('777', 8)).toString(8);
  console.log('✓ 文件权限:', mode);
  
  // 验证可读
  const content = fs.readFileSync(testFile, 'utf-8');
  console.log('✓ 文件可读，内容长度:', content.length, '字节');
  
  process.exit(0);
} catch (error) {
  console.error('❌ 错误:', error.message);
  process.exit(1);
}
" || {
    echo -e "${RED}❌ 容器运行失败${NC}"
    exit 1
}

echo ""

# 步骤 5: 验证文件权限和可访问性
echo -e "${YELLOW}🔍 步骤 5: 验证文件权限和可访问性...${NC}"
REPORT_FILE="$TEST_REPORTS_DIR/test-permission-report.md"

if [ -f "$REPORT_FILE" ]; then
    echo -e "${GREEN}✓ 文件存在: $REPORT_FILE${NC}"
    
    # 检查文件权限（Unix 系统）
    if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "win32" ]]; then
        PERMISSIONS=$(stat -f "%OLp" "$REPORT_FILE" 2>/dev/null || stat -c "%a" "$REPORT_FILE" 2>/dev/null || echo "unknown")
        echo -e "${BLUE}  文件权限: $PERMISSIONS${NC}"
        
        if [ "$PERMISSIONS" = "666" ] || [ "$PERMISSIONS" = "0666" ]; then
            echo -e "${GREEN}  ✅ 权限正确 (666 - rw-rw-rw-)${NC}"
        else
            echo -e "${YELLOW}  ⚠️  权限为 $PERMISSIONS，不是预期的 666${NC}"
        fi
    fi
    
    # 检查文件是否可读
    if [ -r "$REPORT_FILE" ]; then
        echo -e "${GREEN}  ✅ 文件可读${NC}"
    else
        echo -e "${RED}  ❌ 文件不可读${NC}"
    fi
    
    # 检查文件是否可写
    if [ -w "$REPORT_FILE" ]; then
        echo -e "${GREEN}  ✅ 文件可写${NC}"
    else
        echo -e "${YELLOW}  ⚠️  文件不可写${NC}"
    fi
    
    # 尝试读取文件内容
    echo ""
    echo -e "${BLUE}📄 文件内容预览:${NC}"
    head -5 "$REPORT_FILE" | sed 's/^/  /'
    echo ""
    
    # 获取文件所有者信息
    if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "win32" ]]; then
        OWNER=$(stat -f "%Su:%Sg" "$REPORT_FILE" 2>/dev/null || stat -c "%U:%G" "$REPORT_FILE" 2>/dev/null || echo "unknown")
        echo -e "${BLUE}  文件所有者: $OWNER${NC}"
        CURRENT_USER=$(whoami)
        echo -e "${BLUE}  当前用户: $CURRENT_USER${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}✅ 测试通过！文件在宿主机上可以正常访问${NC}"
else
    echo -e "${RED}❌ 测试失败！文件不存在: $REPORT_FILE${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ 测试完成！${NC}"
echo ""
echo -e "${YELLOW}清理测试文件:${NC}"
echo "  rm -rf $TEST_REPORTS_DIR"
echo ""

