#!/usr/bin/env bash
set -e
echo "Building CardFlow Native Acceleration Engine (Rust)..."
cargo build --release
mkdir -p bin
cp target/release/cardflow_engine bin/cardflow_engine
chmod +x bin/cardflow_engine
echo "Build successful! Binary copied to backend/native_engine/bin/cardflow_engine"
