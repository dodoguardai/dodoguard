#!/bin/bash

# MySQL Root 密码重置脚本
# 用途: 重置或设置 MySQL root 用户密码

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
MYSQL_BIN="/opt/anaconda3/bin"
MYSQL="${MYSQL_BIN}/mysql"
MYSQLD="${MYSQL_BIN}/mysqld"
MYSQLD_SAFE="${MYSQL_BIN}/mysqld_safe"
DATA_DIR="/opt/anaconda3/data"
SOCKET_FILE="${DATA_DIR}/mysql.sock"
PID_FILE="${DATA_DIR}/mysql.pid"
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
check_mysql_running() {
    if pgrep -f "mysqld" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# 停止 MySQL
stop_mysql() {
    print_info "正在停止 MySQL..."
    pkill -f mysqld
    sleep 3
    
    # 确保完全停止
    if pgrep -f "mysqld" > /dev/null; then
        print_warning "强制终止 MySQL 进程..."
        pkill -9 -f mysqld
        sleep 2
    fi
    
    if ! pgrep -f "mysqld" > /dev/null; then
        print_info "✓ MySQL 已停止"
        return 0
    else
        print_error "无法停止 MySQL"
        return 1
    fi
}

# 方法1: 使用 skip-grant-tables 重置密码
reset_password_skip_grant() {
    print_info "方法 1: 使用 skip-grant-tables 模式重置密码..."
    
    # 确保完全停止现有 MySQL
    if check_mysql_running; then
        print_info "停止现有 MySQL 进程..."
        stop_mysql
        sleep 2
    fi
    
    # 清理 socket 文件
    rm -f "$SOCKET_FILE"
    
    # 启动 MySQL 在安全模式（跳过权限检查）
    print_info "启动 MySQL（跳过权限检查）..."
    local error_log="${DATA_DIR}/reset_error.log"
    
    "$MYSQLD" \
        --datadir="$DATA_DIR" \
        --socket="$SOCKET_FILE" \
        --port="$PORT" \
        --skip-grant-tables \
        --skip-networking \
        --log-error="$error_log" \
        > /dev/null 2>&1 &
    
    local mysql_pid=$!
    
    # 等待 MySQL 启动
    print_info "等待 MySQL 启动（最多 15 秒）..."
    local count=0
    local started=0
    
    while [ $count -lt 15 ]; do
        # 检查进程是否还在运行
        if ! kill -0 $mysql_pid 2>/dev/null; then
            print_error "MySQL 进程意外退出"
            if [ -f "$error_log" ]; then
                print_info "错误日志:"
                tail -20 "$error_log"
            fi
            return 1
        fi
        
        # 检查 socket 文件
        if [ -S "$SOCKET_FILE" ]; then
            sleep 1
            # 尝试连接（在 skip-grant-tables 模式下应该可以无密码连接）
            if "$MYSQL" --socket="$SOCKET_FILE" -u root -e "SELECT 1;" > /dev/null 2>&1; then
                started=1
                break
            fi
        fi
        sleep 1
        count=$((count + 1))
        echo -n "."
    done
    echo ""
    
    if [ $started -eq 0 ]; then
        print_error "MySQL 启动超时或无法连接"
        if [ -f "$error_log" ]; then
            print_info "错误日志:"
            tail -20 "$error_log"
        fi
        kill $mysql_pid 2>/dev/null
        return 1
    fi
    
    print_info "✓ MySQL 已启动（安全模式）"
    
    # 读取新密码
    echo ""
    read -sp "请输入新的 root 密码（直接回车设置为无密码）: " new_password
    echo ""
    read -sp "请再次确认密码: " confirm_password
    echo ""
    
    if [ "$new_password" != "$confirm_password" ]; then
        print_error "两次输入的密码不一致"
        kill $mysql_pid 2>/dev/null
        return 1
    fi
    
    # 执行密码重置
    print_info "正在重置密码..."
    
    # 先刷新权限表
    "$MYSQL" --socket="$SOCKET_FILE" -u root <<EOF 2>&1
FLUSH PRIVILEGES;
EOF
    
    if [ $? -ne 0 ]; then
        print_error "无法刷新权限表"
        kill $mysql_pid 2>/dev/null
        return 1
    fi
    
    # 尝试不同的密码重置方法（兼容不同 MySQL 版本）
    if [ -z "$new_password" ]; then
        print_warning "设置 root 用户无密码..."
        # 方法1: ALTER USER (MySQL 5.7+)
        "$MYSQL" --socket="$SOCKET_FILE" -u root <<EOF 2>&1
ALTER USER 'root'@'localhost' IDENTIFIED BY '';
FLUSH PRIVILEGES;
EOF
        
        # 如果失败，尝试 UPDATE 方法（兼容旧版本）
        if [ $? -ne 0 ]; then
            print_info "尝试使用 UPDATE 方法（清空密码）..."
            "$MYSQL" --socket="$SOCKET_FILE" -u root mysql <<EOF 2>&1
UPDATE user SET authentication_string='', plugin='mysql_native_password' WHERE User='root' AND Host='localhost';
FLUSH PRIVILEGES;
EOF
        fi
        
        # 再次刷新权限
        "$MYSQL" --socket="$SOCKET_FILE" -u root -e "FLUSH PRIVILEGES;" > /dev/null 2>&1
    else
        print_info "设置 root 密码..."
        # 方法1: ALTER USER (MySQL 5.7+)
        "$MYSQL" --socket="$SOCKET_FILE" -u root <<EOF 2>&1
ALTER USER 'root'@'localhost' IDENTIFIED BY '$new_password';
FLUSH PRIVILEGES;
EOF
        
        # 如果失败，尝试 UPDATE 方法（兼容旧版本）
        if [ $? -ne 0 ]; then
            print_info "尝试使用 UPDATE 方法（设置密码）..."
            # 对于 MySQL 8.0+，使用不同的方法
            "$MYSQL" --socket="$SOCKET_FILE" -u root mysql <<EOF 2>&1
UPDATE user SET authentication_string='', plugin='mysql_native_password' WHERE User='root' AND Host='localhost';
FLUSH PRIVILEGES;
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$new_password';
FLUSH PRIVILEGES;
EOF
        fi
        
        # 再次刷新权限
        "$MYSQL" --socket="$SOCKET_FILE" -u root -e "FLUSH PRIVILEGES;" > /dev/null 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        print_info "✓ 密码重置成功"
        
        # 停止安全模式的 MySQL
        print_info "停止安全模式 MySQL..."
        kill $mysql_pid
        sleep 3
        
        # 确保进程完全停止
        if kill -0 $mysql_pid 2>/dev/null; then
            print_warning "强制终止 MySQL 进程..."
            kill -9 $mysql_pid 2>/dev/null
            sleep 1
        fi
        
        # 清理 socket
        rm -f "$SOCKET_FILE"
        
        # 正常启动 MySQL
        print_info "正常启动 MySQL..."
        if [ -f "$MYSQLD_SAFE" ]; then
            "$MYSQLD_SAFE" \
                --datadir="$DATA_DIR" \
                --socket="$SOCKET_FILE" \
                --port="$PORT" \
                --bind-address=127.0.0.1 \
                > /dev/null 2>&1 &
        else
            "$MYSQLD" \
                --datadir="$DATA_DIR" \
                --socket="$SOCKET_FILE" \
                --port="$PORT" \
                --bind-address=127.0.0.1 \
                > /dev/null 2>&1 &
        fi
        
        sleep 4
        
        # 测试新密码
        print_info "测试新密码..."
        local test_result=1
        if [ -z "$new_password" ]; then
            "$MYSQL" --socket="$SOCKET_FILE" -u root -e "SELECT 1;" > /dev/null 2>&1
            test_result=$?
        else
            "$MYSQL" --socket="$SOCKET_FILE" -u root -p"$new_password" -e "SELECT 1;" > /dev/null 2>&1
            test_result=$?
        fi
        
        if [ $test_result -eq 0 ]; then
            print_info "✓ 密码验证成功！"
            echo ""
            if [ -z "$new_password" ]; then
                print_info "连接命令:"
                echo "  ${MYSQL_BIN}/mysql -u root --socket=$SOCKET_FILE"
            else
                print_info "连接命令:"
                echo "  ${MYSQL_BIN}/mysql -u root -p --socket=$SOCKET_FILE"
            fi
            return 0
        else
            print_error "密码验证失败，但密码可能已重置"
            print_info "请尝试手动连接测试"
            return 1
        fi
    else
        print_error "密码重置失败"
        if [ -f "$error_log" ]; then
            print_info "错误日志:"
            tail -10 "$error_log"
        fi
        kill $mysql_pid 2>/dev/null
        return 1
    fi
}

# 方法2: 如果 MySQL 未运行，重新初始化
reinitialize_mysql() {
    print_warning "方法 2: 重新初始化 MySQL（将删除所有数据！）"
    echo ""
    read -p "这将删除所有数据库和数据，是否继续？(yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "已取消"
        return 1
    fi
    
    # 停止 MySQL
    if check_mysql_running; then
        stop_mysql
    fi
    
    # 备份数据目录（可选）
    if [ -d "$DATA_DIR" ] && [ "$(ls -A $DATA_DIR 2>/dev/null)" ]; then
        local backup_dir="${DATA_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
        print_info "备份数据目录到: $backup_dir"
        mv "$DATA_DIR" "$backup_dir"
    fi
    
    # 创建新数据目录
    mkdir -p "$DATA_DIR"
    chmod 755 "$DATA_DIR"
    
    # 初始化
    print_info "初始化 MySQL 数据目录（无密码模式）..."
    "$MYSQLD" --initialize-insecure --datadir="$DATA_DIR" 2>&1 | tee "${DATA_DIR}/init.log"
    
    if [ $? -eq 0 ]; then
        print_info "✓ 初始化成功"
        print_info "root 用户当前无密码"
        print_info "建议运行此脚本设置密码"
        return 0
    else
        print_error "初始化失败"
        return 1
    fi
}

# 主函数
main() {
    print_header "MySQL Root 密码重置脚本"
    echo ""
    
    # 检查 MySQL 是否在运行
    if check_mysql_running; then
        print_info "MySQL 正在运行中"
        echo ""
        print_info "选择操作："
        echo "  1) 重置现有 root 密码（推荐）"
        echo "  2) 重新初始化 MySQL（删除所有数据）"
        echo ""
        read -p "请选择 (1/2): " choice
        
        case $choice in
            1)
                if reset_password_skip_grant; then
                    print_info ""
                    print_info "=========================================="
                    print_info "密码重置完成！"
                    print_info "=========================================="
                    exit 0
                else
                    print_error "密码重置失败"
                    exit 1
                fi
                ;;
            2)
                if reinitialize_mysql; then
                    print_info ""
                    print_info "=========================================="
                    print_info "MySQL 已重新初始化"
                    print_info "现在可以启动 MySQL: ./start_mysql.sh"
                    print_info "=========================================="
                    exit 0
                else
                    print_error "重新初始化失败"
                    exit 1
                fi
                ;;
            *)
                print_error "无效选择"
                exit 1
                ;;
        esac
    else
        print_warning "MySQL 未运行"
        echo ""
        print_info "选择操作："
        echo "  1) 重新初始化 MySQL（删除所有数据，root 无密码）"
        echo "  2) 先启动 MySQL，然后重置密码"
        echo ""
        read -p "请选择 (1/2): " choice
        
        case $choice in
            1)
                if reinitialize_mysql; then
                    print_info ""
                    print_info "=========================================="
                    print_info "MySQL 已重新初始化"
                    print_info "现在可以启动 MySQL: ./start_mysql.sh"
                    print_info "=========================================="
                    exit 0
                else
                    print_error "重新初始化失败"
                    exit 1
                fi
                ;;
            2)
                print_info "请先运行: ./start_mysql.sh"
                print_info "然后再次运行此脚本重置密码"
                exit 0
                ;;
            *)
                print_error "无效选择"
                exit 1
                ;;
        esac
    fi
}

# 运行主函数
main
