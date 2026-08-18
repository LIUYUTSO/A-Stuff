#!/bin/bash

# A-STUFF - Local Sync Helper
# This script pulls the latest 3D models and data from GitHub to your local desktop.

echo "-----------------------------------------------"
echo "🌀 A-STUFF: Synchronizing with Cloud Archive..."
echo "-----------------------------------------------"

# Ensure we are in the correct directory
cd "$(dirname "$0")"

# Check if git is installed
if ! command -v git &> /dev/null
then
    echo "❌ Error: Git is not installed on this machine."
    exit
fi

# Pull latest changes
git pull origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Success! Your local workstation is now aligned with GitHub."
    echo "📦 New 3D models and data have been downloaded."
else
    echo ""
    echo "❌ Sync Failed. Please check your internet connection or Git permissions."
fi

echo "-----------------------------------------------"
read -p "Press Enter to close this window..."
