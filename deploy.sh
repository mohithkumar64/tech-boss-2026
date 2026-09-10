#!/usr/bin/env bash
# Tech Boss 2026 - Automatic Deployment Script
# Automatically commits all changes and deploys live to GitHub Pages

set -e

MSG="${1:-Update Tech Boss 2026 files and live deployment}"

echo "🚀 Starting automatic deployment..."
git add -A

if git diff --cached --quiet; then
  echo "✨ No local changes to deploy. Repository is up to date."
else
  git commit -m "$MSG"
  echo "✅ Committed changes: $MSG"
fi

echo "📡 Pushing to GitHub (main branch)..."
git push origin main

echo "🎉 Deployment successful!"
echo "🌐 Live Website: https://mohithkumar64.github.io/tech-boss-2026/"
echo "🎮 Game Zone:   https://mohithkumar64.github.io/tech-boss-2026/gamezone.html"
echo "👑 Admin Portal: https://mohithkumar64.github.io/tech-boss-2026/admin.html"
