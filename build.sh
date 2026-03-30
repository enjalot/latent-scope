#!/bin/bash
set -e

version=${1:-$(python3 -c "exec(open('latentscope/__version__.py').read()); print(__version__)")}
echo "Building latentscope v${version}"

echo "Cleaning build artifacts..."
rm -rf dist/ build/ *.egg-info latentscope/web/dist

echo "Building web assets..."
(cd web && npm ci && npm run production)

echo "Copying web assets into package tree..."
mkdir -p latentscope/web/dist
cp -r web/dist/production/* latentscope/web/dist/

echo "Building wheel and sdist..."
uv build

echo "Build complete. Artifacts:"
ls -la dist/

echo ""
echo "To test installation:"
echo "  uv venv testenv --python 3.12"
echo "  uv pip install \"dist/latentscope-${version}-py3-none-any.whl\" --python testenv/bin/python"
echo ""
echo "To publish to PyPI:"
echo "  uv publish"
