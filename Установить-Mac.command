#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Сначала установите Node.js с nodejs.org (LTS)"; exit 1; fi
npm install && npm run dist
echo "Готово! Установщик (.dmg) лежит в папке dist."
