#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR="venv"

# 1. Create virtual environment (if it doesn't exist)
if [ ! -d "$VENV_DIR" ]; then
    echo "🐍 Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    echo "✅ Virtual environment created."
else
    echo "✅ Virtual environment already exists."
fi

# 2. Activate the virtual environment
source "$VENV_DIR/bin/activate"
echo "✅ Virtual environment activated."

# 3. Upgrade pip
pip install --upgrade pip --quiet

# 4. Install dependencies
echo "📦 Installing dependencies from requirements.txt..."
pip install -r requirements.txt
echo "✅ All dependencies installed."

# 5. Run the app
echo "🚀 Starting RAG service..."
python retriver.py
