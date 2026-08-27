#!/bin/bash
set -e # Exit on error

echo "🚀 Setting up DodoGuard workspace..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Are you in the right directory?"
  exit 1
fi

# Check Node.js version
REQUIRED_NODE_VERSION=$(cat .nvmrc 2>/dev/null | sed 's/v//' || echo "20.0.0")
CURRENT_NODE_VERSION=$(node --version | sed 's/v//')

echo "📦 Checking Node.js version..."
echo "   Required: v${REQUIRED_NODE_VERSION}"
echo "   Current:  v${CURRENT_NODE_VERSION}"

# Compare versions (simple major version check)
REQUIRED_MAJOR=$(echo $REQUIRED_NODE_VERSION | cut -d. -f1)
CURRENT_MAJOR=$(echo $CURRENT_NODE_VERSION | cut -d. -f1)

if [ "$CURRENT_MAJOR" -lt "$REQUIRED_MAJOR" ]; then
  echo "❌ Error: Node.js version ${REQUIRED_NODE_VERSION} or higher is required"
  echo "   Current version: ${CURRENT_NODE_VERSION}"
  echo "   Please install Node.js ${REQUIRED_NODE_VERSION} or use nvm:"
  echo "   nvm install ${REQUIRED_NODE_VERSION}"
  echo "   nvm use ${REQUIRED_NODE_VERSION}"
  exit 1
fi

# Check if npm is available
if ! command -v npm &>/dev/null; then
  echo "❌ Error: npm is not installed"
  echo "   Please install npm (it comes with Node.js)"
  exit 1
fi

echo "✅ Node.js version OK"

# Check for .env file in base repo and offer to symlink it
if [ -n "$CONDUCTOR_ROOT_PATH" ] && [ -f "$CONDUCTOR_ROOT_PATH/.env" ]; then
  echo "📄 Found .env file in base repo"
  if [ ! -f ".env" ]; then
    echo "   Creating symlink to .env..."
    ln -s "$CONDUCTOR_ROOT_PATH/.env" ".env"
    echo "✅ .env symlinked successfully"
  else
    echo "   .env already exists in workspace"
  fi
else
  echo "ℹ️  No .env file found in base repo"
  echo "   If you need API keys for testing, create a .env file in:"
  echo "   $CONDUCTOR_ROOT_PATH/.env"
fi

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install

if [ $? -ne 0 ]; then
  echo "❌ Error: npm install failed"
  exit 1
fi

echo "✅ Dependencies installed successfully"

# Build the project
echo "🔨 Building project..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Error: Build failed"
  exit 1
fi

echo "✅ Build completed successfully"

echo ""
echo "🎉 Workspace setup complete!"
echo ""
echo "Next steps:"
echo "  • Click 'Run' to start the development server (npm run dev)"
echo "  • Or run commands manually: npm test, npm run local, etc."
echo ""
