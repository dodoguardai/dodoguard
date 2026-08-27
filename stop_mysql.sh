#!/bin/bash

# MySQL 停止脚本 (Anaconda 版本)
# 用途: 安全停止 Anaconda 中的 MySQL 服务器

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
MYSQL_BIN="/opt/anaconda3/bin"
MYSQLADMIN="${MYSQL_BIN}/mysqladmin"
DATA_DIR="/opt/anaconda3/data"
PID_FILE="${DATA_DIR}/mysql.pid"
SOCKET_FILE="${DATA_DIR}/mysql.sock"
PORT=3306

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

# 检查 MySQL 是否在运行
check_running() {
    if ! pgrep -f "mysqld" > /dev/null; then
        print_warning "MySQL 似乎没有在运行"
        return 1
    fi
    return 0
}

# 显示运行中的 MySQL 进程
show_processes() {
    print_info "运行中的 MySQL 进程:"
    ps aux | grep -E "mysqld|mysqld_safe" | grep -v grep
    echo ""
}

# 方法1: 使用 mysqladmin 优雅关闭
shutdown_graceful() {
    print_info "尝试优雅关闭 MySQL..."
    
    # 尝试使用 socket 连接
    if [ -S "$SOCKET_FILE" ] && [ -f "$MYSQLADMIN" ]; then
        print_info "使用 socket 连接关闭..."
        "$MYSQLADMIN" shutdown --socket="$SOCKET_FILE" 2>/dev/null
        if [ $? -eq 0 ]; then
            return 0
        fi
    fi
    
    # 尝试使用 TCP 连接
    if [ -f "$MYSQLADMIN" ]; then
        print_info "使用 TCP 连接关闭..."
        "$MYSQLADMIN" shutdown -h 127.0.0.1 -P "$PORT" 2>/dev/null
        if [ $? -eq 0 ]; then
            return 0
        fi
    fi
    
    # 尝试使用 PID 文件
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            print_info "使用 PID 文件关闭 (PID: $pid)..."
            kill -TERM "$pid" 2>/dev/null
            sleep 2
            if ! kill -0 "$pid" 2>/dev/null; then
                return 0
            fi
        fi
    fi
    
    return 1
}

# 方法2: 使用 SIGTERM 信号
shutdown_terminate() {
    print_info "发送 SIGTERM 信号..."
    pkill -TERM -f "mysqld"
    
    # 等待进程结束（最多 5 秒）
    local count=0
    while [ $count -lt 5 ]; do
        if ! pgrep -f "mysqld" > /dev/null; then
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    
    return 1
}

# 方法3: 强制终止
shutdown_force() {
    print_warning "强制终止 MySQL 进程..."
    pkill -9 -f "mysqld"
    sleep 1
    
    if ! pgrep -f "mysqld" > /dev/null; then
        return 0
    fi
    return 1
}

# 清理 PID 文件
cleanup_pid_file() {
    if [ -f "$PID_FILE" ]; then
        rm -f "$PID_FILE"
        print_info "已清理 PID 文件: $PID_FILE"
    fi
}

# 验证 MySQL 已停止
verify_stopped() {
    if ! pgrep -f "mysqld" > /dev/null; then
        print_info "✓ MySQL 已成功停止"
        cleanup_pid_file
        return 0
    else
        print_error "MySQL 仍在运行"
        show_processes
        return 1
    fi
}

# 主函数
main() {
    print_header "MySQL 停止脚本"
    echo ""
    
    if ! check_running; then
        print_info "MySQL 未运行，无需停止"
        cleanup_pid_file
        exit 0
    fi
    
    show_processes
    
    # 尝试优雅关闭
    if shutdown_graceful; then
        sleep 2
        if verify_stopped; then
            exit 0
        fi
    fi
    
    # 如果优雅关闭失败，尝试 SIGTERM
    print_warning "优雅关闭失败，尝试使用 SIGTERM..."
    if shutdown_terminate; then
        sleep 2
        if verify_stopped; then
            exit 0
        fi
    fi
    
    # 如果还是失败，询问是否强制终止
    print_error "正常关闭失败"
    echo ""
    read -p "是否要强制终止 MySQL 进程？(y/n): " answer
    if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
        if shutdown_force; then
            sleep 1
            if verify_stopped; then
                print_warning "MySQL 已被强制终止（可能导致数据不一致）"
                exit 0
            fi
        fi
    else
        print_info "已取消，MySQL 仍在运行"
        exit 1
    fi
    
    print_error "无法停止 MySQL"
    show_processes
    exit 1
}

# 运行主函数
main
