#Requires -Version 5.1

<#
.SYNOPSIS
    Tiger Code Pilot - Windows Installer
.DESCRIPTION
    Handles installation, dependency management, and environment setup for Windows.
.USAGE
    .\install.ps1              # Full installation
    .\install.ps1 -DepsOnly    # Install dependencies only
    .\install.ps1 -CLI         # Install CLI globally
#>

[CmdletBinding()]
param(
    [switch]$DepsOnly,
    [switch]$CLI,
    [switch]$VSCode
)

# Colors
function Write-Info { Write-Host "ℹ️  $args" -ForegroundColor Blue }
function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Warn { Write-Host "⚠️  $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Section { 
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $args" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

# Check prerequisites
function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check Node.js
    $nodeVersion = node --version 2>$null
    if (-not $nodeVersion) {
        Write-Error "Node.js not found"
        Write-Info "Install from: https://nodejs.org/"
        exit 1
    }
    
    $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($majorVersion -ge 18) {
        Write-Success "Node.js $nodeVersion installed"
    } else {
        Write-Error "Node.js 18+ required (found $nodeVersion)"
        exit 1
    }
    
    # Check npm
    $npmVersion = npm --version 2>$null
    if ($npmVersion) {
        Write-Success "npm $npmVersion installed"
    } else {
        Write-Error "npm not found"
        exit 1
    }
}

# Install dependencies
function Install-Dependencies {
    Write-Info "Installing dependencies..."
    
    if (Test-Path "package.json") {
        npm install --production
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Dependencies installed"
        } else {
            Write-Error "Failed to install dependencies"
            exit 1
        }
    } else {
        Write-Error "package.json not found"
        exit 1
    }
}

# Compile TypeScript
function Compile-TypeScript {
    Write-Info "Compiling TypeScript..."
    
    npm run compile
    if ($LASTEXITCODE -eq 0) {
        Write-Success "TypeScript compiled"
    } else {
        Write-Error "TypeScript compilation failed"
        exit 1
    }
}

# Setup environment variables
function Setup-Environment {
    Write-Info "Setting up environment..."
    
    # Create .env.example
    if (-not (Test-Path ".env.example")) {
        @'
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
'@ | Set-Content -Path ".env.example" -Encoding UTF8
        Write-Success "Created .env.example"
    }
    
    # Create .env if it doesn't exist
    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        Write-Warn "Created .env - Add your API keys!"
    }
    
    Write-Info "To set API keys permanently:"
    Write-Host "  [Environment]::SetEnvironmentVariable('DASHSCOPE_API_KEY', 'your_key', 'User')" -ForegroundColor Cyan
    Write-Host "  Restart your terminal after setting" -ForegroundColor Yellow
}

# Install CLI globally
function Install-CLI {
    Write-Info "Installing CLI globally..."
    
    npm link
    if ($LASTEXITCODE -eq 0) {
        Write-Success "CLI installed globally"
        Write-Info "Run: tiger-code-pilot help"
    } else {
        Write-Error "CLI installation failed"
        exit 1
    }
}

# Create desktop shortcut
function Create-Shortcut {
    Write-Info "Creating desktop shortcut..."
    
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktopPath "Tiger Code Pilot.lnk"
    
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-NoExit -Command `"cd '$PWD'; tiger-code-pilot setup`""
    $shortcut.WorkingDirectory = $PWD.Path
    $shortcut.Description = "Tiger Code Pilot - AI Coding Assistant"
    $shortcut.Save()
    
    Write-Success "Desktop shortcut created"
}

# Post-installation
function Write-PostInstall {
    Write-Section "🐯 Tiger Code Pilot - Installation Complete!"
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Set up your AI model:" -ForegroundColor White
    Write-Host "   tiger-code-pilot setup" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "2. Test connection:" -ForegroundColor White
    Write-Host "   tiger-code-pilot test-connection" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "3. Start coding:" -ForegroundColor White
    Write-Host "   tiger-code-pilot chat" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Available Providers:" -ForegroundColor Cyan
    Write-Host "  ⭐ Qwen (Free 2K/day): https://bailian.console.alibabacloud.com/" -ForegroundColor White
    Write-Host "  ⚡ Groq (Free Llama): https://console.groq.com/" -ForegroundColor White
    Write-Host "  🤗 HuggingFace (Free Tier): https://huggingface.co/settings/tokens" -ForegroundColor White
    Write-Host "  🏠 Ollama (Local): https://ollama.ai/" -ForegroundColor White
    Write-Host ""
    Write-Host "Documentation:" -ForegroundColor Cyan
    Write-Host "  README.md - Full setup guide" -ForegroundColor White
    Write-Host "  COMMANDS.md - All CLI commands" -ForegroundColor White
    Write-Host ""
}

# Main installation
function Main {
    Write-Section "🐯 Tiger Code Pilot - Windows Installer"
    Write-Host ""
    
    Test-Prerequisites
    Write-Host ""
    
    Install-Dependencies
    Write-Host ""
    
    if ($DepsOnly) {
        Write-Success "Dependencies installed"
        exit 0
    }
    
    Compile-TypeScript
    Write-Host ""
    
    Setup-Environment
    Write-Host ""
    
    if ($CLI) {
        Install-CLI
        Write-Host ""
    }
    
    Create-Shortcut
    Write-Host ""
    
    Write-PostInstall
}

# Run installation
Main
