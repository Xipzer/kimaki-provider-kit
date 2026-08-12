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
  --spec-type draft-mtp --spec-draft-n-max 3 ^
  --host 0.0.0.0 --port 8080 ^
  -ngl 99 -c 131072 -np 1 -fa on --jinja ^
  --cache-type-k q8_0 --cache-type-v q8_0 --no-mmap
```

> ⚠️ **The flag is `--spec-type draft-mtp`, not `--spec-type mtp`.**
> It was renamed on 2026-05-13 (PR #22673) to sit alongside `draft-eagle3` and
> `draft-dflash`. The old name **does not error** — it is silently ignored as an unknown
> spec-type, so the model loads, generation works, and you quietly lose the entire
> speedup. On a 27B that is roughly 120 t/s → 50 t/s with no indication anything is wrong.
>
> `--jinja` is also required if you want tool calling: it loads the model's real chat
> template from GGUF metadata, which is what carries the tool-call format.

**Tune `--spec-draft-n-max` at the context you actually ship, not a small one.** Draft
acceptance falls as the value rises, and on a VRAM-constrained card a larger draft buffer
can tip the KV cache into system RAM. Measured on a 32 GB RTX 5090 at `-c 204800`:

| `--spec-draft-n-max` | tok/s | acceptance |
|---|---|---|
| 2 | 111.2 | 71.1% |
| **3** | **122.9** | 64.9% |
| 4 | 33.7 | 62.3% |
| 6 | 19.7 | 47.3% |

Only ~79 MiB of VRAM separates 3 from 4 — that is the point the driver starts evicting to
system RAM and throughput collapses. The same sweep at `-c 32768`, where nothing spills,
prefers 4. Benchmark at your real context or you will pick the wrong value.

## Alternative speedup: Qwen3.6-27B + DFlash

DFlash is a **different** speculative-decoding method (llama.cpp PR #22105, merged
Jun 2026, NVIDIA + Georgi Gerganov). Instead of MTP's built-in head, it uses a
tiny **external draft model** (~2B) that proposes a whole block of candidate
tokens per step, which the target verifies in parallel.

```bat
llama-server -m  "Qwen3.6-27B-Q4_K_M.gguf" ^
             -md "Qwen3.6-27B-DFlash-Q4_K_M.gguf" ^
  --spec-type draft-dflash --spec-draft-n-max 15 ^
  --temp 0 --top-k 1 ^
  --host 0.0.0.0 --port 8080 ^
  -ngl 99 -c 131072 -np 1 -fa on --jinja ^
  --cache-type-k q8_0 --cache-type-v q8_0 --no-mmap
```

- Flag is **`--spec-type draft-dflash`** (NOT `dflash`); draft passed via **`-md`**.
- `--spec-draft-n-max 15` = the draft block size (bigger = more speculative tokens
  per step; 15 is the PR's Qwen3.6-27B setting).

**Draft model** (the DFlash speculator is only ~2B params → ~1.2–1.5 GB at Q4_K_M):
- Upstream: [`z-lab/Qwen3.6-27B-DFlash`](https://huggingface.co/z-lab/Qwen3.6-27B-DFlash)
- Pre-converted GGUFs: [`Anbeeld/Qwen3.6-27B-DFlash-GGUF`](https://huggingface.co/Anbeeld/Qwen3.6-27B-DFlash-GGUF),
  [`Alittlehammmer/Qwen3.6-27B-DFlash-GGUF-llama.cpp`](https://huggingface.co/Alittlehammmer/Qwen3.6-27B-DFlash-GGUF-llama.cpp)

**PR benchmark (Qwen3.6-27B Q4_K_M, DGX Spark)** — speedup vs *unaccelerated* Q4:

| Category | Baseline t/s | DFlash t/s | Speedup | Accept rate |
|---|---|---|---|---|
| coding | 12.63 | 39.32 | **3.11×** | 0.31 |
| rag | 12.54 | 51.07 | **4.07×** | 0.44 |
| reasoning | 12.56 | 30.42 | 2.42× | 0.23 |
| **overall** | 12.57 | 33.76 | **2.69×** | 0.25 |

> **MTP vs DFlash are mutually exclusive** — pick one. The daily-driver MTP config
> above already gives a large speedup on a **Q6_K** target with **no extra draft
> VRAM**. DFlash needs a **Q4_K_M** target (Q6→Q4 quality drop) plus the ~1.5 GB
> draft. The PR's "2.69×" is measured vs *no acceleration*, not vs MTP — so on your
> 5090 the real question is **DFlash-Q4 vs MTP-Q6**, which nobody has published.
> Run the A/B: [dflash-benchmark.md](./dflash-benchmark.md).

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
| **MTP** (`--spec-type draft-mtp`) | Speculative decoding via the built-in MTP head → the ~2.3× speedup. No extra VRAM. Renamed from `mtp` on 2026-05-13; the old name fails silently. |
| **DFlash** (`--spec-type draft-dflash -md <draft>`) | Separate ~2B draft model; needs a Q4 target. Mutually exclusive with MTP — see the DFlash section + benchmark doc. |

- **Framebuffer competes for VRAM.** Monitors + GPU-accelerated apps eat VRAM
  (floor ~0.8 GB, up to several GB). Overflow into system RAM kills throughput —
  close GPU apps when serving at high context.
- **t/s variance** on identical prompts (e.g. 159 vs 176) is normal — driven by
  framebuffer/app load and thermal state.

## Shutdown

`Ctrl+C` in the `llama-server` window. VRAM drops back to ~1.5–1.6 GB idle.
