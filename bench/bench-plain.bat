@echo off
REM Config C - plain Q6 (control, no speculative decoding). True baseline t/s.
set "MODELS=C:\models"
set "LLAMA=llama-server"

"%LLAMA%" -m "%MODELS%\Qwen3.6-27B-Q6_K.gguf" ^
  --host 0.0.0.0 --port 8080 ^
  -ngl 99 -c 131072 -np 1 -fa on ^
  --cache-type-k q8_0 --cache-type-v q8_0 --no-mmap
