#!/bin/bash

# MySQL 卸载脚本 (适用于 DMG 安装的 MySQL)
# 作者: Auto-generated
# 用途: 完全卸载通过 DMG 安装的 MySQL

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# 检查是否有管理员权限
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        print_warning "此脚本需要管理员权限，将使用 sudo 执行部分操作"
    fi
}

# 停止 MySQL 服务
stop_mysql_services() {
    print_info "正在停止 MySQL 服务..."
    
    # 停止 LaunchDaemon 服务
    if [ -f /Library/LaunchDaemons/com.oracle.oss.mysql.mysqld.plist ]; then
        sudo launchctl unload -w /Library/LaunchDaemons/com.oracle.oss.mysql.mysqld.plist 2>/dev/null || true
        print_info "已停止 com.oracle.oss.mysql.mysqld 服务"
    fi
    
    if [ -f /Library/LaunchDaemons/com.mysql.mysqld.plist ]; then
        sudo launchctl unload -w /Library/LaunchDaemons/com.mysql.mysqld.plist 2>/dev/null || true
        print_info "已停止 com.mysql.mysqld 服务"
    fi
    
    # 查找并停止所有 MySQL 相关服务
    for plist in /Library/LaunchDaemons/*mysql*.plist; do
        if [ -f "$plist" ]; then
            sudo launchctl unload -w "$plist" 2>/dev/null || true
            print_info "已停止服务: $(basename $plist)"
        fi
    done
    
    # 强制停止所有 MySQL 进程
    if pgrep -x mysqld > /dev/null; then
        sudo pkill -9 mysqld 2>/dev/null || true
        sleep 2
        print_info "已停止所有 MySQL 进程"
    else
        print_info "没有运行中的 MySQL 进程"
    fi
}

# 删除 MySQL 程序文件
remove_mysql_files() {
    print_info "正在删除 MySQL 程序文件..."
    
    # 删除主安装目录
    if [ -d /usr/local/mysql ]; then
        sudo rm -rf /usr/local/mysql
        print_info "已删除 /usr/local/mysql"
    fi
    
    # 删除所有 mysql-* 目录
    for dir in /usr/local/mysql-*; do
        if [ -d "$dir" ]; then
            sudo rm -rf "$dir"
            print_info "已删除 $dir"
        fi
    done
    
    # 删除可执行文件
    for file in /usr/local/bin/mysql*; do
        if [ -f "$file" ] || [ -L "$file" ]; then
            sudo rm -f "$file"
            print_info "已删除 $file"
        fi
    done
    
    # 删除库文件
    for file in /usr/local/lib/mysql*; do
        if [ -f "$file" ] || [ -L "$file" ] || [ -d "$file" ]; then
            sudo rm -rf "$file"
            print_info "已删除 $file"
        fi
    done
}

# 删除 MySQL 数据文件（可选）
remove_mysql_data() {
    print_warning "是否删除 MySQL 数据文件？这将删除所有数据库！"
    read -p "输入 'yes' 继续，其他任意键跳过: " confirm
    
    if [ "$confirm" = "yes" ]; then
        print_info "正在删除 MySQL 数据文件..."
        
        if [ -d /usr/local/var/mysql ]; then
            sudo rm -rf /usr/local/var/mysql
            print_info "已删除 /usr/local/var/mysql"
        fi
        
        if [ -d /usr/local/mysql/data ]; then
            sudo rm -rf /usr/local/mysql/data
            print_info "已删除 /usr/local/mysql/data"
        fi
        
        # 删除日志文件
        for log in /usr/local/var/mysql-*; do
            if [ -f "$log" ] || [ -d "$log" ]; then
                sudo rm -rf "$log"
                print_info "已删除 $log"
            fi
        done
    else
        print_info "跳过数据文件删除"
    fi
}

# 删除配置文件
remove_mysql_config() {
    print_info "正在删除 MySQL 配置文件..."
    
    if [ -f /etc/my.cnf ]; then
        sudo rm -f /etc/my.cnf
        print_info "已删除 /etc/my.cnf"
    fi
    
    if [ -d /etc/mysql ]; then
        sudo rm -rf /etc/mysql
        print_info "已删除 /etc/mysql"
    fi
    
    if [ -f ~/.my.cnf ]; then
        rm -f ~/.my.cnf
        print_info "已删除 ~/.my.cnf"
    fi
}

# 删除 LaunchDaemon 和 LaunchAgent
remove_launch_agents() {
    print_info "正在删除 LaunchDaemon 和 LaunchAgent..."
    
    # 删除系统服务
    for plist in /Library/LaunchDaemons/*mysql*.plist; do
        if [ -f "$plist" ]; then
            sudo rm -f "$plist"
            print_info "已删除 $plist"
        fi
    done
    
    # 删除用户代理
    for plist in ~/Library/LaunchAgents/*mysql*.plist; do
        if [ -f "$plist" ]; then
            rm -f "$plist"
            print_info "已删除 $plist"
        fi
    done
}

# 删除偏好设置和缓存
remove_preferences() {
    print_info "正在删除偏好设置和缓存..."
    
    if [ -d /Library/PreferencePanes/MySQL.prefPane ]; then
        sudo rm -rf /Library/PreferencePanes/MySQL.prefPane
        print_info "已删除 /Library/PreferencePanes/MySQL.prefPane"
    fi
    
    if [ -d ~/Library/PreferencePanes/MySQL.prefPane ]; then
        rm -rf ~/Library/PreferencePanes/MySQL.prefPane
        print_info "已删除 ~/Library/PreferencePanes/MySQL.prefPane"
    fi
    
    # 删除缓存
    for cache in ~/Library/Caches/com.mysql.*; do
        if [ -d "$cache" ] || [ -f "$cache" ]; then
            rm -rf "$cache"
            print_info "已删除 $cache"
        fi
    done
    
    for cache in /Library/Caches/com.mysql.*; do
        if [ -d "$cache" ] || [ -f "$cache" ]; then
            sudo rm -rf "$cache"
            print_info "已删除 $cache"
        fi
    done
}

# 清理 PATH 环境变量
clean_path() {
    print_info "正在清理 PATH 环境变量..."
    
    if [ -f /etc/paths.d/mysql ]; then
        sudo rm -f /etc/paths.d/mysql
        print_info "已删除 /etc/paths.d/mysql"
    fi
    
    print_warning "请手动检查以下文件，删除 MySQL 相关路径："
    print_warning "  - ~/.zshrc"
    print_warning "  - ~/.bash_profile"
    print_warning "  - ~/.bashrc"
}

# 验证卸载
verify_uninstall() {
    print_info "正在验证卸载结果..."
    
    local found=0
    
    # 检查命令
    if command -v mysql > /dev/null 2>&1; then
        print_error "仍然找到 mysql 命令: $(which mysql)"
        found=1
    fi
    
    if command -v mysqld > /dev/null 2>&1; then
        print_error "仍然找到 mysqld 命令: $(which mysqld)"
        found=1
    fi
    
    # 检查进程
    if pgrep -x mysqld > /dev/null; then
        print_error "仍然有 MySQL 进程在运行"
        found=1
    fi
    
    # 检查文件
    if [ -d /usr/local/mysql ]; then
        print_error "仍然存在目录: /usr/local/mysql"
        found=1
    fi
    
    if [ -f /Library/LaunchDaemons/com.oracle.oss.mysql.mysqld.plist ] || \
       [ -f /Library/LaunchDaemons/com.mysql.mysqld.plist ]; then
        print_error "仍然存在 LaunchDaemon 文件"
        found=1
    fi
    
    if [ $found -eq 0 ]; then
        print_info "✓ MySQL 卸载验证通过！"
        return 0
    else
        print_warning "仍有部分文件或进程残留，请手动检查"
        return 1
    fi
}

# 主函数
main() {
    echo "=========================================="
    echo "  MySQL 卸载脚本"
    echo "=========================================="
    echo ""
    
    print_warning "此脚本将完全卸载 MySQL，包括所有数据库文件（如果选择删除）"
    read -p "是否继续？(yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "已取消卸载"
        exit 0
    fi
    
    echo ""
    check_sudo
    
    stop_mysql_services
    echo ""
    
    remove_mysql_files
    echo ""
    
    remove_mysql_data
    echo ""
    
    remove_mysql_config
    echo ""
    
    remove_launch_agents
    echo ""
    
    remove_preferences
    echo ""
    
    clean_path
    echo ""
    
    verify_uninstall
    echo ""
    
    print_info "卸载完成！"
    print_warning "建议重启终端或运行 'source ~/.zshrc' 使环境变量生效"
    print_warning "如果修改了 ~/.zshrc 等文件，请手动删除其中的 MySQL 路径"
}

# 运行主函数
main
