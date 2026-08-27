#!/bin/bash

# DodoGuard Quick Start with MySQL
# This script sets up MySQL and starts DodoGuard

echo "🚀 Starting DodoGuard with MySQL..."

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | sed 's/v//')
REQUIRED_VERSION="18.0.0"

if ! [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please upgrade to Node.js 18+."
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# Setup MySQL database
echo "🐬 Setting up MySQL database..."
if [ -f "mysql-manager.sh" ]; then
    ./mysql-manager.sh full
    if [ $? -ne 0 ]; then
        echo "❌ MySQL setup failed. Running diagnostic..."
        echo ""
        if [ -f "diagnose-mysql.sh" ]; then
            ./diagnose-mysql.sh
        fi
        echo ""
        echo "💡 常见解决方案:"
        echo "1. 安装 MySQL: sudo apt install mysql-server"
        echo "2. 手动启动: sudo systemctl start mysql"
        echo "3. 直接启动: sudo ./mysql-manager.sh direct"
        echo "4. 检查权限: sudo ./diagnose-mysql.sh"
        exit 1
    fi
else
    echo "⚠️  mysql-manager.sh not found. Using legacy setup script..."
    if [ -f "setup-mysql.sh" ]; then
        ./setup-mysql.sh
        if [ $? -ne 0 ]; then
            echo "❌ MySQL setup failed. Please check MySQL installation and try again."
            exit 1
        fi
    else
        echo "⚠️  No MySQL setup script found. Please run MySQL setup manually."
    fi
fi

# Copy MySQL configuration if .env doesn't exist
if [ ! -f ".env" ]; then
    echo "📋 Setting up environment configuration..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Copied .env.example to .env"
    else
        echo "⚠️  .env.example not found. Please create .env file manually."
    fi
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    npm install
fi

if [ ! -d "shadcn-admin-main/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd shadcn-admin-main && npm install && cd ..
fi

# Run database migrations
echo "🗄️  Running database migrations..."
npm run db:migrate

echo ""
echo "🎉 DodoGuard is ready!"
echo ""
echo "🌐 Starting servers..."
echo "   Backend API: http://localhost:15500"
echo "   Frontend UI: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Start the development servers
npm run dev
