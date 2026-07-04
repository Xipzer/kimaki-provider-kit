# llama.cpp launch cookbook (single 32 GB GPU)

Battle-tested `llama-server` launch commands for serving a fast, high-quality
local LLM to Kimaki from a **single 32 GB-class GPU** (e.g. RTX 5090). Tune the
paths, `-c`, and quant to your own hardware.

Serving engine: `llama-server` (llama.cpp). Start with `--host 0.0.0.0` so Kimaki
on another machine can reach it. Then wire it up via
[connect-local-llm.md](./connect-local-llm.md).

## Daily driver: Qwen3.6-27B + MTP (~115–119 t/s)

Speculative decoding via the multi-token-prediction head gives ~2.3× over the
plain baseline (~50 t/s) at flagship one-shot quality.

```bat
llama-server -m "Qwen3.6-27B-MTP-Q6_K.gguf" ^
  --spec-type mtp --spec-draft-n-max 3 ^
  --host 0.0.0.0 --port 8080 ^
  -ngl 99 -c 131072 -np 1 -fa on ^
  --cache-type-k q8_0 --cache-type-v q8_0 --no-mmap
```

## Vision daily driver: Gemma 4 26B-A4B MoE (~160–178 t/s)

MoE, image vision via `--mmproj` (no video). ~3× faster than the 31B dense.

```bat
llama-server -m "gemma-4-26B-A4B-it-Q8_0.gguf" ^
  --mmproj "gemma-4-26B-A4B-it-mmproj.gguf" ^
  --host 0.0.0.0 --port 8080 ^
  -ngl 99 -c 262144 -np 2 -b 4096 -fa on ^
  --cache-type-k q8_0 --cache-type-v q8_0 --no-mmap
```

## Dense quality option: Gemma 4 31B (~51–57 t/s)

```bat
llama-server -m "gemma-4-31B-it-Q6_K.gguf" ^
  --host 0.0.0.0 --port 8080 ^
  -ngl 99 -c 65536 -np 1 -b 4096 -fa on ^
  --cache-type-k q8_0 --cache-type-v q8_0 --no-mmap
```

> **~51 t/s is the real ceiling** for a dense 31B on a 5090. Do NOT force tensors
> to GPU with `--override-tensor ".*=CUDA0"` — it HURT (dropped to ~24 t/s).
> llama.cpp intentionally keeps embedding/output tensors on CPU for sampling.

## Tuning knowledge (hard-won)

| Knob | Guidance |
|---|---|
| **Context ceiling (32 GB)** | `131072` is the safe practical max for daily use. `262144` overflows into system RAM and tanks t/s. VRAM sits ~30.9–31.5 GB at 131K. |
| **KV cache** | `--cache-type-k/v q8_0` = quality; `q4_0` = smaller/faster but lossy. Prefer q8 at high context. |
| **`-np` (parallel slots)** | `-np 1` for single-user quality; `-np 2` allows concurrency but splits the KV budget. |
| **`-fa on`** | Flash attention — always on. |
| **`--no-mmap`** | Always on for Windows. |
| **`-ngl 99`** | All layers on GPU. |
| **MTP** (`--spec-type mtp`) | Speculative decoding via the MTP head → the ~2.3× speedup. |
| **DFlash** | Separate draft model for a bigger jump (`--spec-type dflash --spec-draft-ngl all`). |

- **Framebuffer competes for VRAM.** Monitors + GPU-accelerated apps eat VRAM
  (floor ~0.8 GB, up to several GB). Overflow into system RAM kills throughput —
  close GPU apps when serving at high context.
- **t/s variance** on identical prompts (e.g. 159 vs 176) is normal — driven by
  framebuffer/app load and thermal state.

## Shutdown

`Ctrl+C` in the `llama-server` window. VRAM drops back to ~1.5–1.6 GB idle.
