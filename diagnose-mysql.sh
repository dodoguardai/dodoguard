#!/bin/bash

# MySQL 诊断脚本
# 帮助诊断 MySQL 安装和配置问题

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

print_header "MySQL 诊断报告"

# 检查操作系统
print_info "操作系统信息:"
uname -a
echo ""

# 检查 MySQL 相关命令
print_info "检查 MySQL 命令:"

commands=("mysql" "mysqld" "mysqld_safe" "mysqladmin")
for cmd in "${commands[@]}"; do
    if command -v "$cmd" &> /dev/null; then
        path=$(which "$cmd")
        version=$("$cmd" --version 2>/dev/null | head -1)
        echo "  ✅ $cmd: $path"
        if [ -n "$version" ]; then
            echo "     版本: $version"
        fi
    else
        echo "  ❌ $cmd: 未找到"
    fi
done
echo ""

# 检查系统服务
print_info "检查系统服务:"

# systemctl
if command -v systemctl &> /dev/null; then
    echo "  systemctl 可用"
    if sudo systemctl list-units --all | grep -q mysql; then
        echo "  ✅ 找到 MySQL systemctl 服务"
        sudo systemctl status mysql --no-pager -l 2>/dev/null | head -5 || true
    else
        echo "  ❌ 未找到 MySQL systemctl 服务"
    fi
else
    echo "  ❌ systemctl 不可用"
fi

# service
if command -v service &> /dev/null; then
    echo "  service 命令可用"
else
    echo "  ❌ service 命令不可用"
fi
echo ""

# 检查文件和目录
print_info "检查文件和目录:"

dirs=("/var/lib/mysql" "/var/log/mysql" "/var/run/mysqld" "/etc/mysql")
for dir in "${dirs[@]}"; do
    if [ -d "$dir" ]; then
        echo "  ✅ 目录存在: $dir"
        ls -la "$dir" 2>/dev/null | head -3 || echo "    (无权限查看)"
    else
        echo "  ❌ 目录不存在: $dir"
    fi
done
echo ""

# 检查进程
print_info "检查运行进程:"
if pgrep -f mysqld > /dev/null; then
    echo "  ✅ 找到 MySQL 进程"
    ps aux | grep mysqld | grep -v grep
else
    echo "  ❌ 未找到 MySQL 进程"
fi
echo ""

# 检查网络端口
print_info "检查网络端口:"
if command -v netstat &> /dev/null; then
    if netstat -tln | grep -q ":3306 "; then
        echo "  ✅ MySQL 端口 3306 正在监听"
    else
        echo "  ❌ MySQL 端口 3306 未监听"
    fi
elif command -v ss &> /dev/null; then
    if ss -tln | grep -q ":3306 "; then
        echo "  ✅ MySQL 端口 3306 正在监听"
    else
        echo "  ❌ MySQL 端口 3306 未监听"
    fi
else
    echo "  ⚠️  无法检查端口 (netstat/ss 不可用)"
fi
echo ""

# 检查权限
print_info "检查权限:"
if [ "$EUID" -eq 0 ]; then
    echo "  ✅ 当前用户是 root"
else
    echo "  ⚠️  当前用户不是 root"
    if sudo -n true 2>/dev/null; then
        echo "  ✅ 有 sudo 权限"
    else
        echo "  ❌ 无 sudo 权限"
    fi
fi
echo ""

# MySQL 连接测试
print_info "MySQL 连接测试:"
if command -v mysql &> /dev/null; then
    # 测试本地连接
    if mysql -u root -proot12345 -e "SELECT VERSION();" &>/dev/null; then
        version=$(mysql -u root -proot12345 -e "SELECT VERSION();" 2>/dev/null | tail -1)
        echo "  ✅ 本地连接成功"
        echo "     MySQL 版本: $version"
    else
        echo "  ❌ 本地连接失败 (root/root12345)"
    fi

    # 测试 socket 连接
    if mysql -u root -proot12345 --socket=/var/run/mysqld/mysqld.sock -e "SELECT 1;" &>/dev/null; then
        echo "  ✅ Socket 连接成功"
    else
        echo "  ❌ Socket 连接失败"
    fi
else
    echo "  ❌ mysql 命令不可用"
fi
echo ""

# 推荐解决方案
print_info "推荐解决方案:"

if ! command -v mysql &> /dev/null; then
    echo "1. 安装 MySQL:"
    echo "   Ubuntu/Debian: sudo apt update && sudo apt install mysql-server"
    echo "   CentOS/RHEL: sudo yum install mysql-server"
    echo "   Alpine: apk add mysql mysql-client"
fi

if ! pgrep -f mysqld > /dev/null; then
    echo "2. 启动 MySQL 服务:"
    echo "   systemctl: sudo systemctl start mysql"
    echo "   service: sudo service mysql start"
    echo "   直接启动: sudo ./mysql-manager.sh direct"
fi

if ! mysql -u root -proot12345 -e "SELECT 1;" &>/dev/null; then
    echo "3. 设置 MySQL root 密码:"
    echo "   sudo mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root12345';\""
fi

echo ""
echo "4. 使用 MySQL 管理器:"
echo "   ./mysql-manager.sh status    # 查看状态"
echo "   ./mysql-manager.sh full      # 完整设置"
echo "   ./mysql-manager.sh direct    # 直接启动"

print_header "诊断完成"
