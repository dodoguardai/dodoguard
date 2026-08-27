#!/bin/bash

# DodoGuard MySQL Setup Script
# Enhanced version with better error handling and process management

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# 检查 MySQL 是否正在运行
check_mysql_running() {
    if pgrep -f "mysqld" > /dev/null; then
        print_info "MySQL 服务正在运行"
        return 0
    else
        print_warning "MySQL 服务未运行"
        return 1
    fi
}

# 尝试启动 MySQL 服务（如果存在系统服务）
try_start_system_mysql() {
    print_info "尝试启动系统 MySQL 服务..."

    # 检查常见的 MySQL 服务管理器
    if command -v systemctl &> /dev/null; then
        # Linux systemctl
        if sudo systemctl is-active --quiet mysql 2>/dev/null || sudo systemctl is-active --quiet mysqld 2>/dev/null; then
            print_info "MySQL systemctl 服务已运行"
            return 0
        else
            print_info "尝试启动 MySQL systemctl 服务..."
            sudo systemctl start mysql 2>/dev/null || sudo systemctl start mysqld 2>/dev/null
            sleep 3
            if sudo systemctl is-active --quiet mysql 2>/dev/null || sudo systemctl is-active --quiet mysqld 2>/dev/null; then
                print_info "MySQL systemctl 服务启动成功"
                return 0
            fi
        fi
    elif command -v brew &> /dev/null && brew services list | grep -q mysql; then
        # macOS brew services
        if brew services list | grep mysql | grep -q started; then
            print_info "MySQL brew 服务已运行"
            return 0
        else
            print_info "尝试启动 MySQL brew 服务..."
            brew services start mysql
            sleep 5
            if brew services list | grep mysql | grep -q started; then
                print_info "MySQL brew 服务启动成功"
                return 0
            fi
        fi
    fi

    print_warning "无法启动系统 MySQL 服务"
    return 1
}

# 检查 Docker MySQL 容器
check_docker_mysql() {
    if command -v docker &> /dev/null; then
        if docker ps | grep -q "mysql.*dodoguard"; then
            print_info "Docker MySQL 容器正在运行"
            return 0
        fi
    fi
    return 1
}

# 启动 Docker MySQL 容器
start_docker_mysql() {
    if ! command -v docker &> /dev/null; then
        print_warning "Docker 未安装，跳过 Docker MySQL 检查"
        return 1
    fi

    print_info "检查是否已有 DodoGuard MySQL 容器..."
    if docker ps -a | grep -q "mysql-dodoguard"; then
        print_info "发现现有容器，尝试启动..."
        docker start mysql-dodoguard
        sleep 5
        if docker ps | grep -q "mysql-dodoguard"; then
            print_info "Docker MySQL 容器启动成功"
            return 0
        else
            print_warning "无法启动现有容器，将创建新容器"
            docker rm mysql-dodoguard 2>/dev/null
        fi
    fi

    print_info "创建新的 Docker MySQL 容器..."
    docker run --name mysql-dodoguard \
        -e MYSQL_ROOT_PASSWORD=root12345 \
        -e MYSQL_DATABASE=dodoguard \
        -p 3306:3306 \
        -d mysql:8.0 \
        --character-set-server=utf8mb4 \
        --collation-server=utf8mb4_unicode_ci

    if [ $? -eq 0 ]; then
        print_info "Docker MySQL 容器创建成功，等待启动..."
        sleep 10

        # 等待 MySQL 完全启动
        local count=0
        while [ $count -lt 12 ]; do
            if docker exec mysql-dodoguard mysql -u root -proot12345 -e "SELECT 1;" &>/dev/null; then
                print_info "Docker MySQL 容器启动完成"
                return 0
            fi
            sleep 5
            count=$((count + 1))
            echo -n "."
        done
        echo ""
        print_error "Docker MySQL 容器启动超时"
        return 1
    else
        print_error "Docker MySQL 容器创建失败"
        return 1
    fi
}

# 主设置函数
main() {
    print_header "DodoGuard MySQL Setup"

    # 检查 MySQL 客户端
    if ! command -v mysql &> /dev/null; then
        print_error "MySQL 客户端未找到"
        echo ""
        print_info "安装 MySQL:"
        echo "  macOS: brew install mysql"
        echo "  Ubuntu: sudo apt install mysql-client mysql-server"
        echo "  Docker: docker run --name mysql-dodoguard -e MYSQL_ROOT_PASSWORD=root12345 -e MYSQL_DATABASE=dodoguard -p 3306:3306 -d mysql:8.0"
        exit 1
    fi

    print_info "MySQL 客户端已找到"

    # 检查 MySQL 是否正在运行
    if ! check_mysql_running; then
        print_warning "MySQL 服务未运行，尝试启动..."

        # 按优先级尝试启动 MySQL
        if try_start_system_mysql; then
            print_info "系统 MySQL 服务启动成功"
        elif check_docker_mysql; then
            print_info "Docker MySQL 已在运行"
        elif start_docker_mysql; then
            print_info "Docker MySQL 启动成功"
        else
            print_error "无法启动 MySQL 服务"
            echo ""
            print_info "请手动启动 MySQL:"
            echo "  系统服务: sudo systemctl start mysql"
            echo "  Brew 服务: brew services start mysql"
            echo "  Docker: docker run --name mysql-dodoguard -e MYSQL_ROOT_PASSWORD=root12345 -p 3306:3306 -d mysql:8.0"
            exit 1
        fi
    fi

    # 测试 MySQL 连接
    print_info "测试 MySQL 连接..."
    if ! mysql -u root -proot12345 -e "SELECT 1;" &> /dev/null; then
        print_error "无法连接到 MySQL (root/root12345)"
        echo ""
        print_info "可能的解决方案:"
        echo "1. 检查 MySQL 服务状态"
        echo "2. 确认 root 密码是否正确"
        echo "3. 尝试重置 MySQL root 密码"
        echo "4. 检查 MySQL 是否绑定到正确的主机/端口"
        exit 1
    fi

    print_info "MySQL 连接成功"

    # 创建数据库
    print_info "创建 dodoguard 数据库..."
    mysql -u root -proot12345 -e "
        CREATE DATABASE IF NOT EXISTS dodoguard
        CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci;
    " 2>/dev/null

    if [ $? -eq 0 ]; then
        print_info "数据库创建成功"
    else
        print_warning "数据库创建可能已存在或失败"
    fi

    # 最终连接测试
    print_info "执行最终连接测试..."
    mysql -u root -proot12345 dodoguard -e "SELECT 'MySQL setup completed successfully!' as status;"

    if [ $? -eq 0 ]; then
        print_info "MySQL 设置完成！"
        echo ""
        print_info "📋 接下来的步骤:"
        echo "1. 复制 MySQL 配置:"
        echo "   cp .env.example .env"
        echo ""
        echo "2. 运行数据库迁移:"
        echo "   npm run db:migrate"
        echo ""
        echo "3. 启动应用程序:"
        echo "   npm run dev"
        echo ""
        print_info "🎉 DodoGuard MySQL 环境准备就绪！"
    else
        print_error "数据库设置失败"
        exit 1
    fi
}

# 运行主函数
main
