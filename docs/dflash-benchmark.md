# DFlash vs MTP — A/B benchmark protocol (single 32 GB GPU)

The published DFlash numbers (llama.cpp PR #22105) measure speedup vs
**unaccelerated** decoding. But if you already run the **MTP** daily driver, the
only question that matters is **DFlash-Q4 vs MTP-Q6 on your own GPU** — which
nobody has published. This doc is the exact A/B to settle it on a 32 GB card
(e.g. RTX 5090).

## What you're comparing

| Config | Target | Draft | Method | Quality baseline |
|---|---|---|---|---|
| **A — MTP (current)** | Qwen3.6-27B-**MTP-Q6_K** | (built-in head) | `--spec-type mtp` | Q6 |
| **B — DFlash** | Qwen3.6-27B-**Q4_K_M** | Qwen3.6-27B-DFlash-Q4_K_M | `--spec-type draft-dflash` | Q4 |
| **C — plain (control)** | Qwen3.6-27B-**Q6_K** | none | none | Q6 |

The winner is the config with the **highest tokens/sec that still fits 32 GB at
your working context (131072) without spilling into system RAM** — weighed against
the **Q6→Q4 quality drop** that config B requires.

## 0. Prerequisites (Windows, on the GPU box)

1. **Rebuild llama.cpp from `master`** — DFlash landed in PR #22105 (merged
   Jun 2026). A build older than that has no `draft-dflash`.

   ```bat
   git clone https://github.com/ggml-org/llama.cpp
   cd llama.cpp
   cmake -B build -DGGML_CUDA=ON
   cmake --build build --config Release -j
   ```

2. **Models in `C:\models\`:**
   - `Qwen3.6-27B-MTP-Q6_K.gguf` (already have — config A)
   - `Qwen3.6-27B-Q6_K.gguf` (plain Q6 target — config C)
   - `Qwen3.6-27B-Q4_K_M.gguf` (Q4 target — config B)
   - `Qwen3.6-27B-DFlash-Q4_K_M.gguf` (draft — config B) from
     [`Anbeeld/Qwen3.6-27B-DFlash-GGUF`](https://huggingface.co/Anbeeld/Qwen3.6-27B-DFlash-GGUF)
     or [`Alittlehammmer/Qwen3.6-27B-DFlash-GGUF-llama.cpp`](https://huggingface.co/Alittlehammmer/Qwen3.6-27B-DFlash-GGUF-llama.cpp)

## 1. Run the benchmark

Use the scripts in [`bench/`](../bench/). Each launches one config; run them one at
a time (they all bind port 8080), send the same prompt set, and record t/s + VRAM.

```bat
:: Config A — MTP (current daily driver)
bench\bench-mtp.bat

:: Config B — DFlash
bench\bench-dflash.bat

:: Config C — plain Q6 (control)
bench\bench-plain.bat
```

For each running config, in a second terminal fire the identical prompt set and
read the `predicted_per_second` from the server's timing output:

```bat
bench\run-prompts.bat > results-A.txt   :: (rename per config)
```

Watch VRAM with `nvidia-smi -l 1` in a third window while each config decodes.

## 2. What to record

| Metric | Where |
|---|---|
| **Decode t/s** | server log `eval time … tokens per second`, or the prompt harness output |
| **Peak VRAM** | `nvidia-smi` during a long decode |
| **Accept rate** (B only) | server log `n_accept / n_draft` |
| **Spill?** | if VRAM hits ~31.5 GB and t/s craters, it spilled to system RAM |

Run each prompt 3× and take the median — single-run t/s varies with framebuffer
and thermals (see the cookbook's tuning notes).

## 3. Decide

- **B (DFlash) wins** only if its t/s beats A (MTP) by enough to justify the
  **Q6→Q4 quality drop**, AND it fits 32 GB at 131072 without spill.
- The DFlash draft is tiny (~1.5 GB) and the Q4 target is ~6 GB smaller than Q6,
  so **VRAM fit is very likely** — the open question is purely **speed vs quality**.
- If B wins convincingly on coding (the PR showed **3.1×** on coding vs
  unaccelerated), it may be worth a dedicated "fast/coding" profile while keeping
  MTP-Q6 as the "quality" profile.

## 4. If DFlash wins

Promote it in the [cookbook](./llama-cpp-cookbook.md) as a second daily-driver
profile (not a replacement — keep MTP-Q6 for quality-critical work), and update
your `opencode.json` model entry to point at whichever `llama-server` you launch.

## Notes / gotchas from the PR

- DFlash is **strongest on dense-attention targets** and **coding/RAG** workloads
  (high accept rate); weaker on open-ended prose (lower accept rate).
- On **MoE targets** (e.g. gpt-oss) DFlash speedup shrinks — more experts activate
  during parallel verify. Qwen3.6-27B dense is a good DFlash target.
- `--temp 0 --top-k 1` (greedy) maximizes accept rate for benchmarking; relax for
  real use if you want sampling diversity (accept rate, and thus speedup, drops).
