#!/bin/bash

# DodoGuard Startup Script
# This script helps you start the DodoGuard system

echo "🚀 Starting DodoGuard Security Platform..."

# Check if Node.js is installed
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

# Check if MySQL is available (required for default configuration)
if command -v mysql &> /dev/null; then
    echo "✅ MySQL client found"
    # Test MySQL connection
    if mysql -u root -proot12345 -e "SELECT 1;" &> /dev/null; then
        echo "✅ MySQL connection successful"
    else
        echo "⚠️  MySQL connection failed. Please ensure MySQL is running and credentials are correct."
        echo "   Default config: mysql://root:root12345@localhost:3306/dodoguard"
    fi
else
    echo "⚠️  MySQL client not found. Please install MySQL or configure alternative database."
    echo "   To use SQLite instead: export DB_TYPE=sqlite"
fi

# Set environment variables
export NODE_ENV=development
export DB_TYPE=postgres  # Change to 'sqlite' if you prefer SQLite
export DATABASE_URL="postgresql://postgres:password@localhost:5432/dodoguard"  # Update with your PostgreSQL connection
export JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
export JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-this-in-production"

echo "🔧 Environment configured"

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

# Start the development server
echo "🌐 Starting development server..."
echo "📊 Backend will be available at: http://localhost:15500"
echo "🎨 Frontend will be available at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
