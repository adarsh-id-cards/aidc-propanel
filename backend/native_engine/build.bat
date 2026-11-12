@echo off
echo Building CardFlow Native Acceleration Engine (Rust)...
cargo build --release
if %ERRORLEVEL% EQU 0 (
    if not exist "bin" mkdir bin
    copy /Y "target\release\cardflow_engine.exe" "bin\cardflow_engine.exe"
    echo Build successful! Binary copied to backend\native_engine\bin\cardflow_engine.exe
) else (
    echo Build failed. Please ensure Rust / Cargo is installed.
)
