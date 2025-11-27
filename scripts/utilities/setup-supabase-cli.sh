#!/bin/bash
# Setup script for Supabase CLI authentication and project linking
# This script helps configure Supabase CLI so Cursor can run commands directly

set -e

PROJECT_REF="vnuithaqtpgbwmdvtxik"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🚀 Setting up Supabase CLI for Stratiri"
echo "========================================"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found in PATH"
    echo ""
    echo "Installing Supabase CLI..."
    
    # Create local bin directory if it doesn't exist
    mkdir -p ~/.local/bin
    
    # Download and install Supabase CLI
    cd /tmp
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
        ARCH="arm64"
    else
        ARCH="amd64"
    fi
    
    echo "Downloading Supabase CLI for darwin_${ARCH}..."
    curl -L "https://github.com/supabase/cli/releases/latest/download/supabase_darwin_${ARCH}.tar.gz" -o supabase.tar.gz
    tar -xzf supabase.tar.gz
    mv supabase ~/.local/bin/
    chmod +x ~/.local/bin/supabase
    rm supabase.tar.gz
    
    # Add to PATH if not already there
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo "" >> ~/.zshrc
        echo "# Supabase CLI" >> ~/.zshrc
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> ~/.zshrc
        echo "✅ Added ~/.local/bin to PATH in ~/.zshrc"
        echo "   Please run: source ~/.zshrc or restart your terminal"
    fi
    
    export PATH="$HOME/.local/bin:$PATH"
    echo "✅ Supabase CLI installed successfully"
    echo ""
fi

# Verify installation
SUPABASE_VERSION=$(supabase --version 2>&1 || echo "not found")
echo "📦 Supabase CLI version: $SUPABASE_VERSION"
echo ""

# Check if already linked
cd "$PROJECT_ROOT"
if [ -f ".supabase/config.toml" ] && grep -q "project_id.*=.*$PROJECT_REF" .supabase/config.toml 2>/dev/null; then
    echo "✅ Project already linked to $PROJECT_REF"
    echo ""
else
    echo "🔗 Linking project to Supabase..."
    echo ""
    echo "To link the project, you need to authenticate first."
    echo ""
    echo "Option 1: Interactive login (recommended)"
    echo "  Run: supabase login"
    echo "  Then run: supabase link --project-ref $PROJECT_REF"
    echo ""
    echo "Option 2: Use access token"
    echo "  Get your access token from: https://supabase.com/dashboard/account/tokens"
    echo "  Then run:"
    echo "    export SUPABASE_ACCESS_TOKEN='your-token-here'"
    echo "    supabase link --project-ref $PROJECT_REF"
    echo ""
    echo "Option 3: Use this script with token"
    echo "  SUPABASE_ACCESS_TOKEN='your-token' $0"
    echo ""
    
    if [ -n "$SUPABASE_ACCESS_TOKEN" ]; then
        echo "🔑 Using provided access token..."
        export SUPABASE_ACCESS_TOKEN
        supabase link --project-ref "$PROJECT_REF" --password "$(openssl rand -hex 32)" || {
            echo ""
            echo "⚠️  Link failed. You may need to run this interactively."
            echo "   Try: supabase login && supabase link --project-ref $PROJECT_REF"
            exit 1
        }
        echo "✅ Project linked successfully!"
    else
        echo "⚠️  No access token provided. Please authenticate manually:"
        echo ""
        echo "   1. Run: supabase login"
        echo "   2. Run: supabase link --project-ref $PROJECT_REF"
        echo ""
        echo "   Or set SUPABASE_ACCESS_TOKEN environment variable and rerun this script."
        exit 0
    fi
fi

# Verify link
echo ""
echo "🔍 Verifying project link..."
if supabase projects list &> /dev/null; then
    echo "✅ Supabase CLI is configured and ready to use!"
    echo ""
    echo "You can now use commands like:"
    echo "  - supabase db pull          # Pull remote schema"
    echo "  - supabase db push          # Push local migrations"
    echo "  - supabase db diff          # Compare local vs remote"
    echo "  - supabase db execute       # Execute SQL files"
    echo "  - supabase projects list    # List your projects"
else
    echo "⚠️  Could not verify link. You may need to authenticate:"
    echo "   Run: supabase login"
fi

echo ""
echo "✨ Setup complete!"

