#!/usr/bin/env bash
set -euo pipefail

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Bumping $BUMP for all packages"

# SDK first (dependency of CLI)
echo "--- @easybits.cloud/sdk ---"
cd "$ROOT/packages/sdk"
npm version "$BUMP" --no-git-tag-version
npm publish

# MCP
echo "--- @easybits.cloud/mcp ---"
cd "$ROOT/packages/mcp"
npm version "$BUMP" --no-git-tag-version
npm publish

# CLI (depends on SDK)
echo "--- @easybits.cloud/cli ---"
cd "$ROOT/cli"
npm version "$BUMP" --no-git-tag-version
npm publish

# Commit and tag
cd "$ROOT"
VERSION=$(node -p "require('./packages/sdk/package.json').version")
git add packages/sdk/package.json packages/mcp/package.json cli/package.json
git commit -m "release: packages v$VERSION"
git tag "packages-v$VERSION"

echo ""
echo "Done! Published all packages at v$VERSION"
echo "Run 'git push && git push --tags' to trigger CI and push the release."
