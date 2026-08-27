#!/bin/bash

# MySQL 锁文件修复脚本
# 用途: 修复 "Unable to lock ./ibdata1 error: 35" 等锁文件问题

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
MYSQL_BIN="/opt/anaconda3/bin"
DATA_DIR="/opt/anaconda3/data"
PID_FILE="${DATA_DIR}/mysql.pid"
SOCKET_FILE="${DATA_DIR}/mysql.sock"

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

# 停止所有 MySQL 进程
stop_all_mysql() {
    print_info "步骤 1: 停止所有 MySQL 进程..."
    
    if pgrep -f "mysqld" > /dev/null; then
        print_warning "发现运行中的 MySQL 进程，正在停止..."
        ps aux | grep -E "mysqld|mysqld_safe" | grep -v grep
        
        # 尝试优雅关闭
        pkill -TERM -f mysqld
        sleep 3
        
        # 如果还在运行，强制终止
        if pgrep -f "mysqld" > /dev/null; then
            print_warning "优雅关闭失败，强制终止..."
            pkill -9 -f mysqld
            sleep 2
        fi
        
        if pgrep -f "mysqld" > /dev/null; then
            print_error "无法停止所有 MySQL 进程"
            return 1
        else
            print_info "✓ 所有 MySQL 进程已停止"
        fi
    else
        print_info "✓ 没有运行中的 MySQL 进程"
    fi
    return 0
}

# 清理 PID 文件
cleanup_pid_file() {
    print_info "步骤 2: 清理 PID 文件..."
    
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ]; then
            if kill -0 "$pid" 2>/dev/null; then
                print_warning "PID 文件中的进程仍在运行: $pid"
                print_info "正在终止该进程..."
                kill -9 "$pid" 2>/dev/null
                sleep 1
            fi
        fi
        rm -f "$PID_FILE"
        print_info "✓ 已清理 PID 文件: $PID_FILE"
    else
        print_info "✓ 没有 PID 文件需要清理"
    fi
}

# 清理 Socket 文件
cleanup_socket_file() {
    print_info "步骤 3: 清理 Socket 文件..."
    
    if [ -S "$SOCKET_FILE" ] || [ -f "$SOCKET_FILE" ]; then
        # 检查是否有进程在使用 socket
        if command -v lsof > /dev/null 2>&1; then
            local socket_users=$(lsof "$SOCKET_FILE" 2>/dev/null | grep -v "COMMAND")
            if [ -n "$socket_users" ]; then
                print_warning "检测到进程正在使用 socket:"
                echo "$socket_users"
            fi
        fi
        
        rm -f "$SOCKET_FILE"
        print_info "✓ 已清理 Socket 文件: $SOCKET_FILE"
    else
        print_info "✓ 没有 Socket 文件需要清理"
    fi
}

# 清理锁文件
cleanup_lock_files() {
    print_info "步骤 4: 清理 InnoDB 锁文件..."
    
    if [ ! -d "$DATA_DIR" ]; then
        print_warning "数据目录不存在: $DATA_DIR"
        return 0
    fi
    
    local lock_files=(
        "${DATA_DIR}/ibdata1.lock"
        "${DATA_DIR}/ib_logfile0.lock"
        "${DATA_DIR}/ib_logfile1.lock"
        "${DATA_DIR}/mysql.sock.lock"
        "${DATA_DIR}/.ibdata1.lock"
        "${DATA_DIR}/.ib_logfile0.lock"
        "${DATA_DIR}/.ib_logfile1.lock"
    )
    
    local found=0
    for lock_file in "${lock_files[@]}"; do
        if [ -f "$lock_file" ]; then
            print_info "  删除: $lock_file"
            rm -f "$lock_file"
            found=1
        fi
    done
    
    if [ $found -eq 0 ]; then
        print_info "✓ 没有找到锁文件"
    else
        print_info "✓ 已清理所有锁文件"
    fi
}

# 检查数据目录权限
check_permissions() {
    print_info "步骤 5: 检查数据目录权限..."
    
    if [ ! -d "$DATA_DIR" ]; then
        print_warning "数据目录不存在，将创建: $DATA_DIR"
        mkdir -p "$DATA_DIR"
    fi
    
    # 检查读写权限
    if [ ! -w "$DATA_DIR" ]; then
        print_error "数据目录没有写权限: $DATA_DIR"
        print_info "尝试修复权限..."
        chmod -R 755 "$DATA_DIR" 2>/dev/null || {
            print_error "无法修复权限，可能需要使用 sudo"
            return 1
        }
    fi
    
    print_info "✓ 数据目录权限正常"
    return 0
}

# 检查是否有其他进程使用数据目录
check_data_dir_usage() {
    print_info "步骤 6: 检查数据目录使用情况..."
    
    if command -v lsof > /dev/null 2>&1; then
        local users=$(lsof "$DATA_DIR" 2>/dev/null | grep -v "COMMAND")
        if [ -n "$users" ]; then
            print_warning "检测到其他进程可能正在使用数据目录:"
            echo "$users" | head -10
            echo ""
            read -p "是否要继续？这些进程可能会阻止 MySQL 启动 (y/n): " answer
            if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
                return 1
            fi
        else
            print_info "✓ 没有其他进程使用数据目录"
        fi
    else
        print_warning "未安装 lsof，跳过此检查"
    fi
    return 0
}

# 验证修复
verify_fix() {
    print_info "步骤 7: 验证修复..."
    
    # 检查是否还有进程
    if pgrep -f "mysqld" > /dev/null; then
        print_error "仍有 MySQL 进程在运行"
        return 1
    fi
    
    # 检查是否还有锁文件
    local lock_files=(
        "${DATA_DIR}/ibdata1.lock"
        "${DATA_DIR}/ib_logfile0.lock"
        "${DATA_DIR}/ib_logfile1.lock"
    )
    
    for lock_file in "${lock_files[@]}"; do
        if [ -f "$lock_file" ]; then
            print_error "仍有锁文件存在: $lock_file"
            return 1
        fi
    done
    
    print_info "✓ 修复验证通过"
    return 0
}

# 主函数
main() {
    print_header "MySQL 锁文件修复脚本"
    echo ""
    print_warning "此脚本将："
    echo "  1. 停止所有 MySQL 进程"
    echo "  2. 清理所有锁文件和残留文件"
    echo "  3. 检查并修复权限问题"
    echo ""
    read -p "是否继续？(y/n): " confirm
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "已取消"
        exit 0
    fi
    
    echo ""
    
    if ! stop_all_mysql; then
        print_error "无法停止 MySQL 进程，请手动处理"
        exit 1
    fi
    
    echo ""
    cleanup_pid_file
    echo ""
    cleanup_socket_file
    echo ""
    cleanup_lock_files
    echo ""
    
    if ! check_permissions; then
        print_error "权限检查失败"
        exit 1
    fi
    
    echo ""
    if ! check_data_dir_usage; then
        print_info "已取消修复"
        exit 0
    fi
    
    echo ""
    if verify_fix; then
        print_info ""
        print_info "=========================================="
        print_info "修复完成！现在可以尝试启动 MySQL："
        print_info "  ./start_mysql.sh"
        print_info "=========================================="
        exit 0
    else
        print_error "修复验证失败，可能仍有问题"
        exit 1
    fi
}

# 运行主函数
main
