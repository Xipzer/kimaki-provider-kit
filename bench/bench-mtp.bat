@echo off
REM Config A - MTP (current daily driver). Target Q6, built-in MTP head, no draft.
REM Edit MODELS and LLAMA to your paths. Binds :8080 - run only one bench-*.bat at a time.
set "MODELS=C:\models"
set "LLAMA=llama-server"

"%LLAMA%" -m "%MODELS%\Qwen3.6-27B-MTP-Q6_K.gguf" ^
  --spec-type draft-mtp --spec-draft-n-max 3 ^
  --host 0.0.0.0 --port 8080 ^
  -ngl 99 -c 131072 -np 1 -fa on ^
  --cache-type-k q8_0 --cache-type-v q8_0 --no-mmap
