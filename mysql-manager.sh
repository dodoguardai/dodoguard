#!/bin/bash

# DodoGuard MySQL Manager
# Comprehensive MySQL management script inspired by start_mysql.sh

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# 配置
MYSQL_USER="root"
MYSQL_PASSWORD="root12345"
MYSQL_HOST="127.0.0.1"
MYSQL_PORT="3306"
MYSQL_DATABASE="dodoguard"
MYSQL_SOCKET=""
MYSQL_BIN=""
DATA_DIR=""
LOG_FILE=""
PID_FILE=""

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

print_menu() {
    echo -e "${PURPLE}$1${NC}"
}

# 检测 MySQL 安装类型和路径
detect_mysql_installation() {
    print_info "检测 MySQL 安装..."

    # 检查常见的 MySQL 安装路径（优先检测 Anaconda）
    local mysql_paths=(
        "/opt/anaconda3/bin"      # Anaconda MySQL (优先)
        "/usr/local/anaconda3/bin"
        "/usr/local/mysql/bin"
        "/usr/local/bin"
        "/opt/homebrew/bin"
        "/usr/bin"
    )

    for path in "${mysql_paths[@]}"; do
        if [ -f "${path}/mysql" ]; then
            MYSQL_BIN="${path}"
            print_info "找到 MySQL: ${MYSQL_BIN}"
            break
        fi
    done

    # 如果没找到，检查 PATH
    if [ -z "$MYSQL_BIN" ] && command -v mysql &> /dev/null; then
        MYSQL_BIN=$(dirname "$(which mysql)")
        print_info "使用 PATH 中的 MySQL: ${MYSQL_BIN}"
    fi

    if [ -z "$MYSQL_BIN" ]; then
        print_warning "未找到 MySQL 二进制文件，将尝试使用系统命令"
        MYSQL_BIN=""
    fi

    # 设置数据目录
    if [ -n "$MYSQL_BIN" ]; then
        # 尝试推断数据目录
        if [[ "$MYSQL_BIN" == *anaconda* ]]; then
            DATA_DIR="/opt/anaconda3/data"
        elif [[ "$MYSQL_BIN" == *homebrew* ]]; then
            DATA_DIR="/opt/homebrew/var/mysql"
        else
            DATA_DIR="/var/lib/mysql"
        fi
    fi

    LOG_FILE="${DATA_DIR}/mysql.log"
    PID_FILE="${DATA_DIR}/mysql.pid"
    MYSQL_SOCKET="${DATA_DIR}/mysql.sock"
}

# 检查 MySQL 进程
check_mysql_process() {
    print_info "检查 MySQL 进程..."

    local running_processes=$(pgrep -f mysqld)
    if [ -n "$running_processes" ]; then
        print_info "发现运行中的 MySQL 进程:"
        ps aux | grep -E "mysqld|mysqld_safe" | grep -v grep
        return 0
    else
        print_warning "未发现运行中的 MySQL 进程"
        return 1
    fi
}

# 检查 MySQL 连接
check_mysql_connection() {
    print_info "测试 MySQL 连接..."

    local mysql_cmd="mysql"
    if [ -n "$MYSQL_BIN" ]; then
        mysql_cmd="${MYSQL_BIN}/mysql"
    fi

    # 构建连接参数
    local connect_args="-h ${MYSQL_HOST} -P ${MYSQL_PORT} -u ${MYSQL_USER} -p${MYSQL_PASSWORD}"

    if [ -n "$MYSQL_SOCKET" ] && [ -S "$MYSQL_SOCKET" ]; then
        connect_args="--socket=${MYSQL_SOCKET} -u ${MYSQL_USER} -p${MYSQL_PASSWORD}"
    fi

    if $mysql_cmd $connect_args -e "SELECT 1;" &>/dev/null; then
        print_info "MySQL 连接成功"
        return 0
    else
        print_warning "MySQL 连接失败"
        return 1
    fi
}

# 检查并创建数据库
setup_database() {
    print_info "设置 DodoGuard 数据库..."

    local mysql_cmd="mysql"
    if [ -n "$MYSQL_BIN" ]; then
        mysql_cmd="${MYSQL_BIN}/mysql"
    fi

    # 构建连接参数
    local connect_args="-h ${MYSQL_HOST} -P ${MYSQL_PORT} -u ${MYSQL_USER} -p${MYSQL_PASSWORD}"

    if [ -n "$MYSQL_SOCKET" ] && [ -S "$MYSQL_SOCKET" ]; then
        connect_args="--socket=${MYSQL_SOCKET} -u ${MYSQL_USER} -p${MYSQL_PASSWORD}"
    fi

    # 创建数据库
    $mysql_cmd $connect_args -e "
        CREATE DATABASE IF NOT EXISTS ${MYSQL_DATABASE}
        CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci;
    "

    if [ $? -eq 0 ]; then
        print_info "数据库 '${MYSQL_DATABASE}' 创建成功"
    else
        print_error "数据库创建失败"
        return 1
    fi

    # 测试数据库连接
    $mysql_cmd $connect_args ${MYSQL_DATABASE} -e "SELECT 'Database ready!' as status;"

    if [ $? -eq 0 ]; then
        print_info "数据库连接测试成功"
        return 0
    else
        print_error "数据库连接测试失败"
        return 1
    fi
}

# 启动系统 MySQL 服务
start_system_mysql() {
    print_info "尝试启动系统 MySQL 服务..."

    # 检查是否是 Anaconda MySQL（Anaconda MySQL 不需要系统服务）
    if [ -n "$MYSQL_BIN" ] && [[ "$MYSQL_BIN" == *anaconda* ]]; then
        print_warning "检测到 Anaconda MySQL，跳过系统服务启动"
        print_info "Anaconda MySQL 需要使用直接启动模式"
        return 1
    fi

    # 优先使用 systemctl (现代 Linux)
    if command -v systemctl &> /dev/null; then
        print_info "使用 systemctl 启动 MySQL..."
        sudo systemctl start mysql 2>/dev/null || sudo systemctl start mysqld 2>/dev/null
        sleep 3

        if sudo systemctl is-active --quiet mysql 2>/dev/null || sudo systemctl is-active --quiet mysqld 2>/dev/null; then
            print_info "systemctl MySQL 服务启动成功"
            return 0
        fi
    fi

    # 尝试使用 service 命令 (旧版 Linux)
    if command -v service &> /dev/null; then
        print_info "使用 service 命令启动 MySQL..."
        sudo service mysql start 2>/dev/null || sudo service mysqld start 2>/dev/null
        sleep 3
        if pgrep -f mysqld > /dev/null; then
            print_info "service MySQL 启动成功"
            return 0
        fi
    fi

    # 检查是否有其他启动方式
    if command -v rc-service &> /dev/null; then
        # OpenRC (Alpine Linux, Gentoo)
        print_info "尝试使用 rc-service..."
        if sudo rc-service mysql status &>/dev/null 2>&1; then
            sudo rc-service mysql start
            sleep 3
            if pgrep -f mysqld > /dev/null; then
                print_info "rc-service MySQL 启动成功"
                return 0
            fi
        fi
    fi

    print_warning "系统 MySQL 服务启动失败"
    print_info "将尝试使用直接启动模式..."
    return 1
}

# 直接启动 MySQL (参考 start_mysql.sh)
start_mysql_directly() {
    print_info "尝试直接启动 MySQL..."

    # 检查 MySQL 是否已在运行（参考 start_mysql.sh）
    if pgrep -f "mysqld" > /dev/null; then
        print_warning "MySQL 似乎已经在运行中"
        ps aux | grep -E "mysqld|mysqld_safe" | grep -v grep
        echo ""
        echo -n "是否要停止现有进程并重新启动？(y/n): "
        read -r answer
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
            return 0
        fi
    fi

    # 查找 MySQL 可执行文件（优先检测 Anaconda）
    local mysql_paths=(
        "/opt/anaconda3/bin"      # Anaconda MySQL (优先)
        "/opt/anaconda3/bin"
        "/usr/bin"
        "/usr/sbin"
        "/usr/local/bin"
        "/usr/local/mysql/bin"
        "/opt/mysql/bin"
        "/usr/libexec"
    )

    local MYSQLD=""
    local MYSQLD_SAFE=""
    local MYSQL_BIN=""
    local USE_ANACONDA=false

    for path in "${mysql_paths[@]}"; do
        if [ -f "${path}/mysqld_safe" ]; then
            MYSQLD_SAFE="${path}/mysqld_safe"
            MYSQLD="${path}/mysqld"
            MYSQL_BIN="$path"
            if [[ "$path" == *anaconda* ]]; then
                USE_ANACONDA=true
            fi
            break
        elif [ -f "${path}/mysqld" ]; then
            MYSQLD="${path}/mysqld"
            MYSQL_BIN="$path"
            if [[ "$path" == *anaconda* ]]; then
                USE_ANACONDA=true
            fi
            break
        fi
    done

    if [ -z "$MYSQLD" ]; then
        print_error "未找到 mysqld 可执行文件"
        echo ""
        print_info "请确保 MySQL 已安装:"
        echo "  Anaconda: conda install mysql"
        echo "  Ubuntu/Debian: sudo apt install mysql-server"
        echo "  CentOS/RHEL: sudo yum install mysql-server"
        return 1
    fi

    print_info "找到 MySQL 可执行文件: $MYSQLD"
    if [ "$USE_ANACONDA" = true ]; then
        print_info "检测到 Anaconda MySQL，使用 Anaconda 配置"
    fi

    # 设置 MySQL 数据目录和文件（参考 start_mysql.sh）
    local DATA_DIR
    local LOG_FILE
    local PID_FILE
    local SOCKET_FILE
    local PORT="3306"
    local USE_SUDO=false

    if [ "$USE_ANACONDA" = true ]; then
        # Anaconda MySQL 配置（参考 start_mysql.sh）
        DATA_DIR="/opt/anaconda3/data"
        LOG_FILE="${DATA_DIR}/error.log"
        PID_FILE="${DATA_DIR}/mysql.pid"
        SOCKET_FILE="${DATA_DIR}/mysql.sock"
        USE_SUDO=false  # Anaconda 不需要 sudo
    else
        # 系统 MySQL 配置
        DATA_DIR="/var/lib/mysql"
        LOG_FILE="/var/log/mysql/error.log"
        PID_FILE="/var/run/mysqld/mysqld.pid"
        SOCKET_FILE="/var/run/mysqld/mysqld.sock"
        USE_SUDO=true   # 系统 MySQL 需要 sudo
    fi

    print_info "数据目录: $DATA_DIR"
    print_info "日志文件: $LOG_FILE"
    print_info "Socket 文件: $SOCKET_FILE"
    print_info "端口: $PORT"

    # 检查并创建必要的目录
    if [ ! -d "$DATA_DIR" ]; then
        print_info "创建数据目录: $DATA_DIR"
        if [ "$USE_SUDO" = true ]; then
            sudo mkdir -p "$DATA_DIR" 2>/dev/null
            if [ $? -ne 0 ]; then
                print_error "无法创建数据目录，请检查权限"
                return 1
            fi
            sudo chown mysql:mysql "$DATA_DIR" 2>/dev/null || true
        else
            mkdir -p "$DATA_DIR" 2>/dev/null
            if [ $? -ne 0 ]; then
                print_error "无法创建数据目录，请检查权限"
                return 1
            fi
            chmod 755 "$DATA_DIR"
        fi
    fi

    # 创建其他必要目录
    if [ "$USE_SUDO" = true ]; then
        sudo mkdir -p "/var/run/mysqld" 2>/dev/null
        sudo mkdir -p "/var/log/mysql" 2>/dev/null
    else
        mkdir -p "$(dirname "$PID_FILE")" 2>/dev/null
        mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null
    fi

    # 清理锁文件和残留文件（参考 start_mysql.sh）
    print_info "检查并清理锁文件..."

    # 清理 PID 文件
    if [ -f "$PID_FILE" ]; then
        local old_pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$old_pid" ]; then
            if [ "$USE_SUDO" = true ]; then
                if ! sudo kill -0 "$old_pid" 2>/dev/null; then
                    print_info "清理旧的 PID 文件: $PID_FILE (PID: $old_pid 已不存在)"
                    sudo rm -f "$PID_FILE"
                else
                    print_warning "PID 文件中的进程仍在运行: $old_pid"
                fi
            else
                if ! kill -0 "$old_pid" 2>/dev/null; then
                    print_info "清理旧的 PID 文件: $PID_FILE (PID: $old_pid 已不存在)"
                    rm -f "$PID_FILE"
                else
                    print_warning "PID 文件中的进程仍在运行: $old_pid"
                fi
            fi
        else
            if [ "$USE_SUDO" = true ]; then
                sudo rm -f "$PID_FILE"
            else
                rm -f "$PID_FILE"
            fi
        fi
    fi

    # 清理 socket 文件
    if [ -S "$SOCKET_FILE" ]; then
        print_info "清理旧的 socket 文件: $SOCKET_FILE"
        if [ "$USE_SUDO" = true ]; then
            sudo rm -f "$SOCKET_FILE"
        else
            rm -f "$SOCKET_FILE"
        fi
    fi

    # 清理 InnoDB 锁文件
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
                if [ "$USE_SUDO" = true ]; then
                    sudo rm -f "$lock_file"
                else
                    rm -f "$lock_file"
                fi
            fi
        done

        # 检查是否有其他进程在使用数据目录
        if command -v lsof &> /dev/null; then
            if [ "$USE_SUDO" = true ]; then
                if sudo lsof "$DATA_DIR" 2>/dev/null | grep -q -v "COMMAND"; then
                    print_warning "检测到其他进程可能正在使用数据目录"
                    sudo lsof "$DATA_DIR" 2>/dev/null | head -5
                fi
            else
                if lsof "$DATA_DIR" 2>/dev/null | grep -q -v "COMMAND"; then
                    print_warning "检测到其他进程可能正在使用数据目录"
                    lsof "$DATA_DIR" 2>/dev/null | head -5
                fi
            fi
        fi
    fi

    # 检查数据目录是否存在和是否已初始化（参考 start_mysql.sh）
    if [ ! -d "${DATA_DIR}/mysql" ]; then
        print_warning "数据目录未初始化，正在初始化..."
        print_info "这将创建默认的 MySQL 数据库结构"
        
        if [ -f "$MYSQLD" ]; then
            print_info "使用 mysqld --initialize-insecure（root 用户无密码）"
            if [ "$USE_SUDO" = true ]; then
                if sudo "$MYSQLD" --initialize-insecure --datadir="$DATA_DIR" --user=mysql 2>&1 | tee -a "$LOG_FILE"; then
                    print_info "数据目录初始化成功"
                    print_warning "root 用户当前没有密码，建议稍后设置密码"
                else
                    print_error "数据目录初始化失败，请检查日志: $LOG_FILE"
                    return 1
                fi
            else
                if "$MYSQLD" --initialize-insecure --datadir="$DATA_DIR" 2>&1 | tee -a "$LOG_FILE"; then
                    print_info "数据目录初始化成功"
                    print_warning "root 用户当前没有密码，建议稍后设置密码"
                else
                    print_error "数据目录初始化失败，请检查日志: $LOG_FILE"
                    return 1
                fi
            fi
        else
            print_error "无法初始化：未找到 mysqld 可执行文件"
            return 1
        fi
    else
        print_info "数据目录已存在，跳过初始化"
    fi

    # 启动 MySQL (参考 start_mysql.sh)
    print_info "正在启动 MySQL..."
    print_info "数据目录: $DATA_DIR"
    print_info "日志文件: $LOG_FILE"
    print_info "Socket 文件: $SOCKET_FILE"
    print_info "端口: $PORT"
    echo ""

    local MYSQL_PID=""

    # 使用 mysqld_safe 启动（推荐，更安全）
    if [ -f "$MYSQLD_SAFE" ]; then
        print_info "使用 mysqld_safe 启动..."
        if [ "$USE_SUDO" = true ]; then
            sudo "$MYSQLD_SAFE" \
                --datadir="$DATA_DIR" \
                --log-error="$LOG_FILE" \
                --pid-file="$PID_FILE" \
                --socket="$SOCKET_FILE" \
                --port="$PORT" \
                --bind-address=127.0.0.1 \
                --user=mysql \
                > /dev/null 2>&1 &
        else
            "$MYSQLD_SAFE" \
                --datadir="$DATA_DIR" \
                --log-error="$LOG_FILE" \
                --pid-file="$PID_FILE" \
                --socket="$SOCKET_FILE" \
                --port="$PORT" \
                --bind-address=127.0.0.1 \
                > /dev/null 2>&1 &
        fi

        MYSQL_PID=$!
    else
        # 使用 mysqld 启动
        print_info "使用 mysqld 启动..."
        if [ "$USE_SUDO" = true ]; then
            sudo "$MYSQLD" \
                --datadir="$DATA_DIR" \
                --log-error="$LOG_FILE" \
                --pid-file="$PID_FILE" \
                --socket="$SOCKET_FILE" \
                --port="$PORT" \
                --bind-address=127.0.0.1 \
                --user=mysql \
                > /dev/null 2>&1 &
        else
            "$MYSQLD" \
                --datadir="$DATA_DIR" \
                --log-error="$LOG_FILE" \
                --pid-file="$PID_FILE" \
                --socket="$SOCKET_FILE" \
                --port="$PORT" \
                --bind-address=127.0.0.1 \
                > /dev/null 2>&1 &
        fi

        MYSQL_PID=$!
    fi

    # 检查进程是否启动
    if ! kill -0 "$MYSQL_PID" 2>/dev/null; then
        print_error "MySQL 进程启动失败"
        if [ -f "$LOG_FILE" ]; then
            print_info "查看错误日志:"
            if [ "$USE_SUDO" = true ]; then
                sudo tail -10 "$LOG_FILE" 2>/dev/null || echo "无法读取日志文件"
            else
                tail -10 "$LOG_FILE" 2>/dev/null || echo "无法读取日志文件"
            fi
        fi
        return 1
    fi

    print_info "MySQL 进程已启动 (PID: $MYSQL_PID)"

    # 等待 MySQL 启动 (参考 start_mysql.sh)
    print_info "等待 MySQL 启动（最多 30 秒）..."
    local count=0
    local mysqladmin_cmd="mysqladmin"
    if [ -n "$MYSQL_BIN" ] && [ -f "${MYSQL_BIN}/mysqladmin" ]; then
        mysqladmin_cmd="${MYSQL_BIN}/mysqladmin"
    fi

    while [ $count -lt 30 ]; do
        if [ -S "$SOCKET_FILE" ] || pgrep -f "mysqld" > /dev/null; then
            sleep 1
            # 使用 mysqladmin ping 检查连接
            if "$mysqladmin_cmd" ping --socket="$SOCKET_FILE" > /dev/null 2>&1; then
                print_info "✓ MySQL 启动成功！"
                echo ""
                print_info "进程信息:"
                ps aux | grep -E "mysqld|mysqld_safe" | grep -v grep | head -3
                echo ""
                print_info "连接方式:"
                if [ -n "$MYSQL_BIN" ]; then
                    echo "  ${MYSQL_BIN}/mysql -u root --socket=$SOCKET_FILE"
                else
                    echo "  mysql -u root --socket=$SOCKET_FILE"
                fi
                echo "  或"
                echo "  mysql -u root -h 127.0.0.1 -P $PORT"
                echo ""
                if [ -f "$PID_FILE" ]; then
                    if [ "$USE_SUDO" = true ]; then
                        print_info "PID 文件: $PID_FILE (PID: $(sudo cat $PID_FILE 2>/dev/null))"
                    else
                        print_info "PID 文件: $PID_FILE (PID: $(cat $PID_FILE 2>/dev/null))"
                    fi
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
        if [ "$USE_SUDO" = true ]; then
            sudo tail -20 "$LOG_FILE" 2>/dev/null || echo "无法读取日志文件，请检查权限"
        else
            tail -20 "$LOG_FILE" 2>/dev/null || echo "无法读取日志文件"
        fi
    fi
    return 1
}


# 显示 MySQL 状态
show_mysql_status() {
    print_header "MySQL Status"

    echo "进程状态:"
    if check_mysql_process; then
        echo "  ✅ MySQL 进程运行中"
    else
        echo "  ❌ MySQL 进程未运行"
    fi

    echo ""
    echo "连接状态:"
    if check_mysql_connection; then
        echo "  ✅ MySQL 连接正常"
    else
        echo "  ❌ MySQL 连接失败"
    fi

    echo ""
    echo "配置信息:"
    echo "  主机: ${MYSQL_HOST}"
    echo "  端口: ${MYSQL_PORT}"
    echo "  用户: ${MYSQL_USER}"
    echo "  数据库: ${MYSQL_DATABASE}"
    echo "  二进制路径: ${MYSQL_BIN:-'使用 PATH'}"
    if [ -n "$DATA_DIR" ]; then
        echo "  数据目录: ${DATA_DIR}"
    fi
}

# 显示菜单
show_menu() {
    print_header "DodoGuard MySQL Manager"
    echo ""
    print_menu "选择操作:"
    echo "1) 检查 MySQL 状态"
    echo "2) 启动系统 MySQL 服务"
    echo "3) 直接启动 MySQL (无服务)"
    echo "4) 设置数据库"
    echo "5) 测试连接"
    echo "6) 完整设置 (推荐)"
    echo "7) 退出"
    echo ""
}

# 处理菜单选择
handle_choice() {
    local choice=$1

    case $choice in
        1)
            show_mysql_status
            ;;
        2)
            if start_system_mysql; then
                print_info "系统 MySQL 启动成功"
            else
                print_error "系统 MySQL 启动失败"
            fi
            ;;
        3)
            if start_mysql_directly; then
                print_info "直接 MySQL 启动成功"
            else
                print_error "直接 MySQL 启动失败"
            fi
            ;;
        4)
            if setup_database; then
                print_info "数据库设置成功"
            else
                print_error "数据库设置失败"
            fi
            ;;
        5)
            if check_mysql_connection; then
                print_info "连接测试成功"
            else
                print_error "连接测试失败"
            fi
            ;;
        6)
            print_info "执行完整 MySQL 设置..."

            # 检测安装
            detect_mysql_installation

            # 检查进程
            if ! check_mysql_process; then
                # 尝试启动系统服务
                if ! start_system_mysql; then
                    # 如果系统服务失败，尝试直接启动 MySQL
                    print_warning "系统服务启动失败，尝试直接启动 MySQL..."
                    if ! start_mysql_directly; then
                        print_error "无法启动 MySQL 服务"
                        return 1
                    fi
                fi
            fi

            # 测试连接
            if ! check_mysql_connection; then
                print_error "MySQL 连接失败"
                return 1
            fi

            # 设置数据库
            if ! setup_database; then
                print_error "数据库设置失败"
                return 1
            fi

            print_info "完整 MySQL 设置成功！"
            echo ""
            print_info "📋 接下来的步骤:"
            echo "1. 复制环境配置:"
            echo "   cp .env.example .env"
            echo ""
            echo "2. 运行数据库迁移:"
            echo "   npm run db:migrate"
            echo ""
            echo "3. 启动应用程序:"
            echo "   npm run dev"
            ;;
        7)
            print_info "退出 MySQL Manager"
            exit 0
            ;;
        *)
            print_error "无效选择"
            ;;
    esac
}

# 主函数
main() {
    # 检测 MySQL 安装
    detect_mysql_installation

    # 交互模式
    while true; do
        echo ""
        show_menu
        read -p "请选择 (1-7): " choice
        echo ""

        handle_choice "$choice"

        if [ "$choice" != "1" ]; then
            echo ""
            read -p "按回车键继续..."
        fi
    done
}

# 检查命令行参数
if [ $# -eq 0 ]; then
    # 无参数，进入交互模式
    main
else
    # 有参数，直接执行对应操作
    case $1 in
        "status")
            detect_mysql_installation
            show_mysql_status
            ;;
        "start")
            detect_mysql_installation
            if ! check_mysql_process; then
                start_system_mysql
            fi
            check_mysql_connection
            ;;
        "direct")
            detect_mysql_installation
            start_mysql_directly
            ;;
        "setup")
            detect_mysql_installation
            if check_mysql_connection && setup_database; then
                print_info "MySQL 设置完成"
            else
                print_error "MySQL 设置失败"
                exit 1
            fi
            ;;
        "test")
            detect_mysql_installation
            check_mysql_connection
            ;;
        "full")
            detect_mysql_installation

            print_info "执行完整 MySQL 设置..."

            if ! check_mysql_process; then
                if ! start_system_mysql; then
                    print_warning "系统服务启动失败，尝试直接启动 MySQL..."
                    if ! start_mysql_directly; then
                        print_error "无法启动 MySQL 服务"
                        exit 1
                    fi
                fi
            fi

            if ! check_mysql_connection; then
                print_error "MySQL 连接失败"
                exit 1
            fi

            if ! setup_database; then
                print_error "数据库设置失败"
                exit 1
            fi

            print_info "完整 MySQL 设置成功！"
            ;;
        "help"|"-h"|"--help")
            echo "DodoGuard MySQL Manager"
            echo ""
            echo "用法: $0 [command]"
            echo ""
            echo "命令:"
            echo "  status    显示 MySQL 状态"
            echo "  start     启动系统 MySQL 服务"
            echo "  direct    直接启动 MySQL (无服务)"
            echo "  setup     设置数据库"
            echo "  test      测试连接"
            echo "  full      完整设置 (检测+启动+设置)"
            echo "  help      显示帮助信息"
            echo ""
            echo "无参数运行进入交互模式"
            ;;
        *)
            print_error "未知命令: $1"
            echo "运行 '$0 help' 查看可用命令"
            exit 1
            ;;
    esac
fi
