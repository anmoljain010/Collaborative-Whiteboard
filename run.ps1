# CoDraw - Run Script for Windows PowerShell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Clear-Host
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "      CoDraw Collaborative Whiteboard        " -ForegroundColor Magenta
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host ""

# 1. Verify Node.js is available
try {
  $nodeVersion = node --version
  Write-Host "Node.js detected: $nodeVersion" -ForegroundColor Green
} catch {
  Write-Host "Error: Node.js was not found in your Path. Please ensure Node.js is installed." -ForegroundColor Red
  Exit
}

# 2. Verify Python is available
try {
  $pythonVersion = python --version
  Write-Host "Python detected: $pythonVersion" -ForegroundColor Green
} catch {
  Write-Host "Error: Python was not found. Please ensure Python is installed and in your environment variables." -ForegroundColor Red
  Exit
}

Write-Host ""
Write-Host "Launching servers in separate processes..." -ForegroundColor Gray

# Setup and run backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  $env:Path = '$env:Path'
  $Host.UI.RawUI.WindowTitle = 'CoDraw - FastAPI Backend'
  cd '$PSScriptRoot/backend'
  Write-Host 'Setting up Python virtual environment (.venv)...' -ForegroundColor Cyan
  if (-not (Test-Path '.venv')) {
    python -m venv .venv
  }
  Write-Host 'Activating virtual environment & installing requirements...' -ForegroundColor Cyan
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\pip install -r requirements.txt
  Write-Host 'Starting FastAPI server on http://localhost:8000...' -ForegroundColor Green
  .venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"

# Setup and run frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  $Host.UI.RawUI.WindowTitle = 'CoDraw - Vite Frontend'
  $env:Path = '$env:Path'
  cd '$PSScriptRoot/frontend'
  Write-Host 'Starting React Frontend (Vite)...' -ForegroundColor Green
  npm run dev
"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host " Both servers launched successfully!         " -ForegroundColor Green
Write-Host " - Frontend: http://localhost:5173           " -ForegroundColor Cyan
Write-Host " - Backend API: http://localhost:8000        " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Green
Write-Host "To close, simply close the spawned terminal windows." -ForegroundColor Gray
