#!/bin/bash

# ============================================================================
# DodoGuard Docker 镜像打包脚本
# ============================================================================
# 用途：将构建好的 Docker 镜像打包成 tar.gz 文件，方便传输和分享
# ============================================================================

set -e  # 遇到错误立即退出

# 配置
IMAGE_NAME="${IMAGE_NAME:-zhian:1.0.0}"
OUTPUT_DIR="./docker-packages"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SAFE_IMAGE_NAME=$(echo "${IMAGE_NAME}" | tr '/:' '--')
OUTPUT_FILE="${OUTPUT_DIR}/${SAFE_IMAGE_NAME}-${TIMESTAMP}.tar.gz"
CHECKSUM_FILE="${OUTPUT_DIR}/${SAFE_IMAGE_NAME}-${TIMESTAMP}.sha256"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# 检查 Docker 是否运行
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker 未运行，请先启动 Docker"
        exit 1
    fi
    print_success "Docker 运行正常"
}

# 检查镜像是否存在
check_image() {
    print_info "检查镜像是否存在: ${IMAGE_NAME}"
    if ! docker image inspect "$IMAGE_NAME" > /dev/null 2>&1; then
        print_error "镜像 ${IMAGE_NAME} 不存在"
        echo ""
        print_info "请先构建镜像:"
        echo "  docker build -t ${IMAGE_NAME} ."
        exit 1
    fi
    
    # 显示镜像信息
    IMAGE_SIZE=$(docker image inspect "$IMAGE_NAME" --format='{{.Size}}' | numfmt --to=iec-i --suffix=B 2>/dev/null || docker image inspect "$IMAGE_NAME" --format='{{.Size}}')
    print_success "镜像存在，大小: ${IMAGE_SIZE}"
}

# 创建输出目录
create_output_dir() {
    if [ ! -d "$OUTPUT_DIR" ]; then
        mkdir -p "$OUTPUT_DIR"
        print_success "创建输出目录: ${OUTPUT_DIR}"
    fi
}

# 打包镜像
package_image() {
    print_header "开始打包镜像"
    
    print_info "镜像名称: ${IMAGE_NAME}"
    print_info "输出文件: ${OUTPUT_FILE}"
    print_info "这可能需要几分钟，请耐心等待..."
    echo ""
    
    # 显示进度（使用 pv 如果可用，否则直接执行）
    # 使用 gzip -9 获得最佳压缩率（可选）
    if command -v pv > /dev/null 2>&1; then
        print_info "使用 pv 显示进度..."
        docker save "$IMAGE_NAME" | pv -s $(docker image inspect "$IMAGE_NAME" --format='{{.Size}}') | gzip -9 > "$OUTPUT_FILE"
    else
        print_info "正在导出并压缩镜像..."
        docker save "$IMAGE_NAME" | gzip -9 > "$OUTPUT_FILE"
    fi
    
    if [ ! -f "$OUTPUT_FILE" ]; then
        print_error "打包失败，输出文件不存在"
        exit 1
    fi
    
    print_success "镜像打包完成！"
}

# 生成校验和
generate_checksum() {
    print_info "生成文件校验和..."

    local output_dir
    local output_name
    output_dir=$(dirname "$OUTPUT_FILE")
    output_name=$(basename "$OUTPUT_FILE")
    
    if command -v shasum > /dev/null 2>&1; then
        (cd "$output_dir" && shasum -a 256 "$output_name") > "$CHECKSUM_FILE"
    elif command -v sha256sum > /dev/null 2>&1; then
        (cd "$output_dir" && sha256sum "$output_name") > "$CHECKSUM_FILE"
    else
        print_warning "未找到 sha256sum 或 shasum 命令，跳过校验和生成"
        return
    fi
    
    print_success "校验和已生成: ${CHECKSUM_FILE}"
}

# 显示结果信息
show_results() {
    print_header "打包完成"
    
    # 文件大小
    if command -v du > /dev/null 2>&1; then
        FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    else
        FILE_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
    fi
    
    print_success "文件: ${OUTPUT_FILE}"
    print_success "大小: ${FILE_SIZE}"
    
    if [ -f "$CHECKSUM_FILE" ]; then
        CHECKSUM=$(cat "$CHECKSUM_FILE" | awk '{print $1}')
        print_success "校验和: ${CHECKSUM}"
    fi
    
    echo ""
    print_info "📋 传输给其他人的步骤:"
    echo "  1. 将以下文件发送给对方:"
    echo "     - ${OUTPUT_FILE}"
    if [ -f "$CHECKSUM_FILE" ]; then
        echo "     - ${CHECKSUM_FILE}"
    fi
    echo ""
    echo "  2. 对方可以使用以下命令加载镜像:"
    echo "     gunzip -c $(basename "$OUTPUT_FILE") | docker load"
    echo "     或"
    echo "     docker load -i <解压后的文件>"
    echo ""
    echo "  3. 验证镜像:"
    echo "     docker images | grep dodoguard"
    echo ""
    
    # 显示绝对路径
    ABS_OUTPUT=$(cd "$(dirname "$OUTPUT_FILE")" && pwd)/$(basename "$OUTPUT_FILE")
    print_info "完整路径: ${ABS_OUTPUT}"
}

# 主函数
main() {
    print_header "DodoGuard Docker 镜像打包工具"
    
    check_docker
    check_image
    create_output_dir
    package_image
    generate_checksum
    show_results
    
    print_success "所有操作完成！"
}

# 运行主函数
main
