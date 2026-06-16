#!/bin/bash
# Run this on your EC2 instance to setup the Playwright Headless Browser Worker

echo "1. Installing Playwright dependencies (requires sudo)..."
cd apps/api
npx playwright install --with-deps chromium

echo "2. Installing Systemd Service..."
cd ../
sudo cp jentoai-browser-worker.service /etc/systemd/system/
sudo systemctl daemon-reload

echo "3. Starting and Enabling the Worker..."
sudo systemctl enable jentoai-browser-worker.service
sudo systemctl start jentoai-browser-worker.service

echo "Done! The Browser Queue is now being processed automatically."
echo "You can check the logs using: tail -f apps/api/browser-worker.log"
