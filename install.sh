#!/bin/bash

/**
 * Tiger Code Pilot - Installer & Dependency Manager
 * 
 * Handles installation, dependency management, and environment setup.
 * Supports multiple platforms: macOS, Linux, Windows (via WSL/Git Bash)
 * 
 * Usage:
 *   ./install.sh              # Full installation
 *   ./install.sh --deps-only  # Install dependencies only
 *   ./install.sh --vscode     # Install VSCode extension
 *   ./install.sh --cli        # Install CLI globally
 */

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─── Helper Functions ─────────────────────────────────────────────────────────

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

check_command() {
  if command -v $1 &> /dev/null; then
    return 0
  else
    return 1
  fi
}

# ─── Prerequisites Check ──────────────────────────────────────────────────────

check_prerequisites() {
  log_info "Checking prerequisites..."
  
  # Check Node.js
  if check_command node; then
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
      log_success "Node.js $(node --version) installed"
    else
      log_error "Node.js 18+ required (found $(node --version))"
      log_info "Install: https://nodejs.org/"
      exit 1
    fi
  else
    log_error "Node.js not found"
    log_info "Install: https://nodejs.org/"
    exit 1
  fi
  
  # Check npm
  if check_command npm; then
    log_success "npm $(npm --version) installed"
  else
    log_error "npm not found"
    exit 1
  fi
  
  # Check git (optional)
  if check_command git; then
    log_success "git installed"
  else
    log_warn "git not found (optional, for version control)"
  fi
}

# ─── Install Dependencies ─────────────────────────────────────────────────────

install_dependencies() {
  log_info "Installing dependencies..."
  
  if [ -f "package.json" ]; then
    npm install --production
    
    if [ $? -eq 0 ]; then
      log_success "Dependencies installed"
    else
      log_error "Failed to install dependencies"
      exit 1
    fi
  else
    log_error "package.json not found"
    exit 1
  fi
}

# ─── Compile TypeScript ──────────────────────────────────────────────────────

compile_typescript() {
  log_info "Compiling TypeScript..."
  
  npm run compile
  
  if [ $? -eq 0 ]; then
    log_success "TypeScript compiled"
  else
    log_error "TypeScript compilation failed"
    exit 1
  fi
}

# ─── Run Tests ────────────────────────────────────────────────────────────────

run_tests() {
  log_info "Running tests..."
  
  npm test
  
  if [ $? -eq 0 ]; then
    log_success "All tests passed"
  else
    log_warn "Some tests failed (this is OK for development)"
  fi
}

# ─── Install CLI Globally ────────────────────────────────────────────────────

install_cli() {
  log_info "Installing CLI globally..."
  
  npm link
  
  if [ $? -eq 0 ]; then
    log_success "CLI installed globally"
    log_info "Run: tiger-code-pilot help"
  else
    log_error "CLI installation failed"
    exit 1
  fi
}

# ─── Install VSCode Extension ────────────────────────────────────────────────

install_vscode() {
  log_info "Packaging VSCode extension..."
  
  # Check if vsce is installed
  if ! check_command vsce; then
    log_info "Installing vsce..."
    npm install -g @vscode/vsce
  fi
  
  # Package extension
  vsce package
  
  if [ $? -eq 0 ]; then
    VSIX_FILE=$(ls -1 *.vsix 2>/dev/null | head -n1)
    log_success "Extension packaged: $VSIX_FILE"
    log_info "Install in VSCode: Extensions → Install from VSIX..."
  else
    log_error "VSCode extension packaging failed"
    exit 1
  fi
}

# ─── Setup Environment Variables ─────────────────────────────────────────────

setup_env() {
  log_info "Setting up environment..."
  
  # Create .env.example if it doesn't exist
  if [ ! -f ".env.example" ]; then
    cat > .env.example << 'EOF'
# Tiger Code Pilot - Environment Variables
# Copy this file to .env and fill in your API keys

# Qwen (Alibaba Cloud) - Free 2,000 requests/day
# Get key: https://bailian.console.alibabacloud.com/
DASHSCOPE_API_KEY=your_qwen_api_key_here

# Groq - Free Llama/Mixtral access
# Get key: https://console.groq.com/
GROQ_API_KEY=your_groq_api_key_here

# HuggingFace - Free inference API
# Get token: https://huggingface.co/settings/tokens
HF_TOKEN=your_huggingface_token_here

# Optional: Custom Qwen endpoint (defaults to Alibaba Cloud)
# QWEN_ENDPOINT=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
EOF
    log_success "Created .env.example"
  fi
  
  # Create .env if it doesn't exist
  if [ ! -f ".env" ]; then
    cp .env.example .env
    log_warn "Created .env - Add your API keys!"
  fi
  
  log_info "To set API keys:"
  echo -e "  ${CYAN}export DASHSCOPE_API_KEY=your_key_here${NC}"
  echo -e "  ${CYAN}export GROQ_API_KEY=your_key_here${NC}"
  echo -e "  ${CYAN}export HF_TOKEN=your_token_here${NC}"
}

# ─── Setup Systemd Service (Linux) ──────────────────────────────────────────

setup_systemd_service() {
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    log_info "Setting up systemd service..."
    
    SERVICE_FILE="/etc/systemd/system/tiger-code-pilot.service"
    
    sudo tee $SERVICE_FILE > /dev/null << EOF
[Unit]
Description=Tiger Code Pilot MCP Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which node) src/mcp-server.js --http
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable tiger-code-pilot
    
    log_success "Systemd service created"
    log_info "Start: sudo systemctl start tiger-code-pilot"
    log_info "Status: sudo systemctl status tiger-code-pilot"
  fi
}

# ─── Create Desktop Shortcut (Optional) ──────────────────────────────────────

create_desktop_shortcut() {
  log_info "Creating desktop shortcut..."
  
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    DESKTOP_FILE="$HOME/Desktop/tiger-code-pilot.desktop"
    cat > $DESKTOP_FILE << EOF
[Desktop Entry]
Name=Tiger Code Pilot
Comment=AI Coding Assistant
Exec=bash -c "cd $(pwd) && tiger-code-pilot setup"
Icon=utilities-terminal
Terminal=true
Type=Application
Categories=Development;
EOF
    chmod +x $DESKTOP_FILE
    log_success "Desktop shortcut created"
  
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    log_info "macOS - Create Automator app manually:"
    echo -e "  ${CYAN}1. Open Automator → Application${NC}"
    echo -e "  ${CYAN}2. Add 'Run Shell Script' action${NC}"
    echo -e "  ${CYAN}3. Enter: cd $(pwd) && tiger-code-pilot setup${NC}"
    echo -e "  ${CYAN}4. Save to Applications${NC}"
  fi
}

# ─── Post-Installation ───────────────────────────────────────────────────────

post_install() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}🐯 Tiger Code Pilot - Installation Complete!${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${CYAN}Next Steps:${NC}"
  echo ""
  echo -e "1. Set up your AI model:"
  echo -e "   ${YELLOW}tiger-code-pilot setup${NC}"
  echo ""
  echo -e "2. Test connection:"
  echo -e "   ${YELLOW}tiger-code-pilot test-connection${NC}"
  echo ""
  echo -e "3. Start coding:"
  echo -e "   ${YELLOW}tiger-code-pilot chat${NC}"
  echo ""
  echo -e "${CYAN}Available Providers:${NC}"
  echo -e "  ⭐ Qwen (Free 2K/day): https://bailian.console.alibabacloud.com/"
  echo -e "  ⚡ Groq (Free Llama): https://console.groq.com/"
  echo -e "  🤗 HuggingFace (Free Tier): https://huggingface.co/settings/tokens"
  echo -e "  🏠 Ollama (Local): https://ollama.ai/"
  echo ""
  echo -e "${CYAN}Documentation:${NC}"
  echo -e "  README.md - Full setup guide"
  echo -e "  COMMANDS.md - All CLI commands"
  echo ""
}

# ─── Main Installation Flow ──────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}🐯 Tiger Code Pilot - Installer${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  
  # Parse command line arguments
  DEPS_ONLY=false
  INSTALL_CLI=false
  INSTALL_VSCODE=false
  
  for arg in "$@"; do
    case $arg in
      --deps-only)
        DEPS_ONLY=true
        shift
        ;;
      --cli)
        INSTALL_CLI=true
        shift
        ;;
      --vscode)
        INSTALL_VSCODE=true
        shift
        ;;
      --help)
        echo "Usage: ./install.sh [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --deps-only    Install dependencies only"
        echo "  --cli          Install CLI globally"
        echo "  --vscode       Package VSCode extension"
        echo "  --help         Show this help"
        exit 0
        ;;
    esac
  done
  
  # Check prerequisites
  check_prerequisites
  echo ""
  
  # Install dependencies
  install_dependencies
  echo ""
  
  if [ "$DEPS_ONLY" = true ]; then
    log_success "Dependencies installed"
    exit 0
  fi
  
  # Compile TypeScript
  compile_typescript
  echo ""
  
  # Run tests
  run_tests
  echo ""
  
  # Setup environment
  setup_env
  echo ""
  
  # Install CLI if requested
  if [ "$INSTALL_CLI" = true ]; then
    install_cli
    echo ""
  fi
  
  # Install VSCode extension if requested
  if [ "$INSTALL_VSCODE" = true ]; then
    install_vscode
    echo ""
  fi
  
  # Setup systemd service (Linux only)
  setup_systemd_service 2>/dev/null || true
  echo ""
  
  # Create desktop shortcut
  create_desktop_shortcut 2>/dev/null || true
  echo ""
  
  # Post-installation message
  post_install
}

# Run main installation
main "$@"
