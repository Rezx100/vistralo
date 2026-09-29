#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
cd /opt/vistralo-worker

npm install --omit=dev --no-audit --no-fund
PLAYWRIGHT_BROWSERS_PATH=/opt/vistralo-worker/browsers \
  npx --yes playwright@1.58.2 install --with-deps chrome

echo "CHROME=$(google-chrome --version 2>/dev/null || echo missing)"
echo INSTALL_OK
