#!/bin/bash

# MySQL 启动脚本 (Anaconda 版本)
# 用途: 启动 Anaconda 中的 MySQL 服务器

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
MYSQL_BIN="/opt/anaconda3/bin"
MYSQLD_SAFE="${MYSQL_BIN}/mysqld_safe"
MYSQLD="${MYSQL_BIN}/mysqld"
DATA_DIR="/opt/anaconda3/data"
LOG_FILE="${DATA_DIR}/error.log"
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

# 检查 MySQL 是否已在运行
check_running() {
    if pgrep -f "mysqld" > /dev/null; then
        print_warning "MySQL 似乎已经在运行中"
        ps aux | grep -E "mysqld|mysqld_safe" | grep -v grep
        echo ""
        read -p "是否要停止现有进程并重新启动？(y/n): " answer
        if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
            print_info "正在停止现有 MySQL 进程..."
            pkill -f mysqld
            sleep 3
            # 确保所有进程都已停止
            if pgrep -f "mysqld" > /dev/null; then
                print_warning "仍有进程在运行，强制终止..."
                pkill -9 -f mysqld
                sleep 2
            fi
        else
            print_info "退出，不启动新的 MySQL 实例"
            exit 0
        fi
    fi
}

# 清理锁文件和残留文件
cleanup_lock_files() {
    print_info "检查并清理锁文件..."
    
    # 清理 PID 文件
    if [ -f "$PID_FILE" ]; then
        local old_pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$old_pid" ]; then
            if ! kill -0 "$old_pid" 2>/dev/null; then
                print_info "清理旧的 PID 文件: $PID_FILE (PID: $old_pid 已不存在)"
                rm -f "$PID_FILE"
            else
                print_warning "PID 文件中的进程仍在运行: $old_pid"
            fi
        else
            rm -f "$PID_FILE"
        fi
    fi
    
    # 清理 socket 文件
    if [ -S "$SOCKET_FILE" ]; then
        print_info "清理旧的 socket 文件: $SOCKET_FILE"
        rm -f "$SOCKET_FILE"
    fi
    
    # 清理 InnoDB 锁文件（ibdata1.lock, ib_logfile* 等）
    if [ -d "$DATA_DIR" ]; then
        local lock_files=(
            "${DATA_DIR}/ibdata1.lock"
            "${DATA_DIR}/ib_logfile0.lock"
            "${DATA_DIR}/ib_logfile1.lock"
            "${DATA_DIR}/mysql.sock.lock"
        )
        
        for lock_file in "${lock_files[@]}"; do
            if [ -f "$lock_file" ]; then
                print_info "清理锁文件: $lock_file"
                rm -f "$lock_file"
            fi
        done
        
        # 检查是否有其他进程在使用数据目录
        if lsof "$DATA_DIR" 2>/dev/null | grep -q -v "COMMAND"; then
            print_warning "检测到其他进程可能正在使用数据目录"
            lsof "$DATA_DIR" 2>/dev/null | head -5
        fi
    fi
}

# 检查必要的文件是否存在
check_files() {
    if [ ! -f "$MYSQLD_SAFE" ] && [ ! -f "$MYSQLD" ]; then
        print_error "未找到 MySQL 可执行文件:"
        print_error "  $MYSQLD_SAFE"
        print_error "  $MYSQLD"
        exit 1
    fi
    
    # 如果 mysqld_safe 不存在，使用 mysqld
    if [ ! -f "$MYSQLD_SAFE" ]; then
        print_warning "未找到 mysqld_safe，将使用 mysqld"
        MYSQL_CMD="$MYSQLD"
    else
        MYSQL_CMD="$MYSQLD_SAFE"
    fi
}

# 创建数据目录
create_data_dir() {
    if [ ! -d "$DATA_DIR" ]; then
        print_info "创建数据目录: $DATA_DIR"
        mkdir -p "$DATA_DIR"
        chmod 755 "$DATA_DIR"
    fi
}

# 初始化数据目录（如果不存在）
initialize_data_dir() {
    if [ ! -d "$DATA_DIR/mysql" ]; then
        print_warning "数据目录未初始化，正在初始化..."
        print_info "这将创建默认的 MySQL 数据库结构"
        
        if [ -f "$MYSQLD" ]; then
            print_info "使用 mysqld --initialize-insecure（root 用户无密码）"
            "$MYSQLD" --initialize-insecure --datadir="$DATA_DIR" 2>&1 | tee -a "$LOG_FILE"
            
            if [ $? -eq 0 ]; then
                print_info "数据目录初始化成功"
                print_warning "root 用户当前没有密码，建议稍后设置密码"
            else
                print_error "数据目录初始化失败，请检查日志: $LOG_FILE"
                exit 1
            fi
        else
            print_error "无法初始化：未找到 mysqld 可执行文件"
            exit 1
        fi
    fi
}

# 启动 MySQL
start_mysql() {
    print_info "正在启动 MySQL..."
    print_info "数据目录: $DATA_DIR"
    print_info "日志文件: $LOG_FILE"
    print_info "Socket 文件: $SOCKET_FILE"
    print_info "端口: $PORT"
    echo ""
    
    # 使用 mysqld_safe 启动（推荐，更安全）
    if [ -f "$MYSQLD_SAFE" ]; then
        print_info "使用 mysqld_safe 启动..."
        "$MYSQLD_SAFE" \
            --datadir="$DATA_DIR" \
            --log-error="$LOG_FILE" \
            --pid-file="$PID_FILE" \
            --socket="$SOCKET_FILE" \
            --port="$PORT" \
            --bind-address=127.0.0.1 \
            > /dev/null 2>&1 &
        
        MYSQL_PID=$!
    else
        # 使用 mysqld 启动
        print_info "使用 mysqld 启动..."
        "$MYSQLD" \
            --datadir="$DATA_DIR" \
            --log-error="$LOG_FILE" \
            --pid-file="$PID_FILE" \
            --socket="$SOCKET_FILE" \
            --port="$PORT" \
            --bind-address=127.0.0.1 \
            > /dev/null 2>&1 &
        
        MYSQL_PID=$!
    fi
    
    # 等待 MySQL 启动
    print_info "等待 MySQL 启动（最多 10 秒）..."
    local count=0
    while [ $count -lt 10 ]; do
        if [ -S "$SOCKET_FILE" ] || pgrep -f "mysqld" > /dev/null; then
            sleep 1
            if "${MYSQL_BIN}/mysqladmin" ping --socket="$SOCKET_FILE" > /dev/null 2>&1; then
                print_info "✓ MySQL 启动成功！"
                echo ""
                print_info "进程信息:"
                ps aux | grep -E "mysqld|mysqld_safe" | grep -v grep
                echo ""
                print_info "连接方式:"
                echo "  ${MYSQL_BIN}/mysql -u root --socket=$SOCKET_FILE"
                echo "  或"
                echo "  ${MYSQL_BIN}/mysql -u root -h 127.0.0.1 -P $PORT"
                echo ""
                if [ -f "$PID_FILE" ]; then
                    print_info "PID 文件: $PID_FILE (PID: $(cat $PID_FILE))"
                fi
                return 0
            fi
        fi
        sleep 1
        count=$((count + 1))
        echo -n "."
    done
    echo ""
    
    print_error "MySQL 启动超时或失败"
    print_info "请检查日志文件: $LOG_FILE"
    if [ -f "$LOG_FILE" ]; then
        echo ""
        print_info "最近的错误日志:"
        tail -20 "$LOG_FILE"
    fi
    return 1
}

# 主函数
main() {
    print_header "MySQL 启动脚本"
    echo ""
    
    check_running
    check_files
    create_data_dir
    cleanup_lock_files  # 清理锁文件
    initialize_data_dir
    
    if start_mysql; then
        print_info "MySQL 已成功启动！"
        exit 0
    else
        print_error "MySQL 启动失败"
        print_info "如果遇到 'Unable to lock' 错误，请运行修复脚本: ./fix_mysql_locks.sh"
        exit 1
    fi
}

# 运行主函数
main
