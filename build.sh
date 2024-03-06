#!/bin/bash

version=$1
echo "Version specified: $version"

# Exit in case of error
set -e

echo "Cleaning build directories..."
rm -rf build/
rm -rf dist/
rm -rf latentscope/web/dist

echo "Removing old virtual environment..."
rm -rf testenv-whl/

echo "Deactivating the virtual environment..."
# just in case we are in a virtual env already
# deactivate

echo "Building the wheel..."
python3 setup.py sdist bdist_wheel

echo "Creating a new virtual environment..."
python3 -m venv testenv-whl

echo "Activating the virtual environment..."
source testenv-whl/bin/activate

echo "Installing the wheel..."
pip install "dist/latentscope-${version}-py3-none-any.whl"

echo "Deactivating the virtual environment..."
deactivate

echo "Build and preparation completed."
