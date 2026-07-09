@echo off
REM Config B - DFlash. Target Q4 + external ~2B DFlash draft model.
REM Requires a llama.cpp build with PR #22105 (draft-dflash). Binds :8080.
set "MODELS=C:\models"
set "LLAMA=llama-server"

"%LLAMA%" -m  "%MODELS%\Qwen3.6-27B-Q4_K_M.gguf" ^
          -md "%MODELS%\Qwen3.6-27B-DFlash-Q4_K_M.gguf" ^
  --spec-type draft-dflash --spec-draft-n-max 15 ^
  --temp 0 --top-k 1 ^
  --host 0.0.0.0 --port 8080 ^
  -ngl 99 -c 131072 -np 1 -fa on --jinja ^
  --cache-type-k q8_0 --cache-type-v q8_0 --no-mmap
