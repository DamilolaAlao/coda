#!/bin/sh
set -eu

# Merge pingdotgg/t3code into this tree. This repository's changes win on conflict.
# Histories are independent (this origin was not cloned from t3code), so the merge
# allows unrelated roots. Never reset to upstream; origin stays DamilolaAlao/coda.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream https://github.com/pingdotgg/t3code.git
fi
git remote set-url --push upstream DISABLE

git fetch upstream main
git merge -X ours --allow-unrelated-histories --no-ff --no-edit upstream/main
