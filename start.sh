#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
node -e 'if(Number(process.versions.node.split(".")[0])<24) throw new Error("Install Node.js 24 or newer")'
if [ ! -d node_modules ]; then npm ci; fi
node server.mjs
