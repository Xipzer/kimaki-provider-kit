@echo off
REM Fire an identical prompt set at whichever config is running on :8080 and print
REM the server-reported tokens/sec for each. Windows 10+ ships curl.exe.
REM
REM   bench\bench-mtp.bat        (in window 1, wait for "server listening")
REM   bench\run-prompts.bat > results-A.txt   (in window 2)
REM
REM Repeat per config (rename the output file A/B/C). Run each 3x; take the median.
setlocal enabledelayedexpansion
set "URL=http://127.0.0.1:8080/v1/chat/completions"

set "P1=Write a quicksort in TypeScript. Code only."
set "P2=Explain speculative decoding in three sentences."
set "P3=Refactor a callback-based Node fs.readFile into async/await with error handling."
set "P4=Given a Solana program that transfers SPL tokens, list three security checks."
set "P5=Summarize the tradeoffs between MTP and DFlash speculative decoding."

for %%i in (1 2 3 4 5) do (
  call set "PROMPT=%%P%%i%%"
  echo === prompt %%i ===
  echo !PROMPT!
  curl -s %URL% -H "Content-Type: application/json" -d "{\"model\":\"local\",\"messages\":[{\"role\":\"user\",\"content\":\"!PROMPT!\"}],\"max_tokens\":512,\"temperature\":0}" ^
    | findstr /C:"tokens_per_second" /C:"predicted_per_second" /C:"timings"
  echo.
)

echo Done. Also read the llama-server console for the exact:
echo   eval time = ... tokens per second   (decode t/s)
echo   n_accept / n_draft                  (DFlash accept rate, config B only)
endlocal
