# vLLM cookbook (for Kimaki / OpenCode)

vLLM exposes an **OpenAI-compatible server**, so wiring it into Kimaki is the same
config story as llama.cpp — a `@ai-sdk/openai-compatible` provider block. Use
[templates/vllm-local.provider.json](../templates/vllm-local.provider.json) and
point `baseURL` at vLLM's port (default `8000`).

This doc covers when vLLM is worth it, the launch command, the **honest WSL2
caveats**, and the speculative-decoding gap.

## vLLM vs llama.cpp — pick the right tool

| | **llama.cpp** | **vLLM** |
|---|---|---|
| Best for | Single GPU, simplicity, GGUF | High concurrency, multi-GPU, FP8/NVFP4 |
| Quant formats | GGUF (Q4/Q6/Q8...) | FP16/BF16, AWQ, GPTQ, FP8, **NVFP4** |
| Speculative decode | **Built-in MTP** (huge speedup) | Needs a separate draft model / `--speculative-config` |
| Multi-GPU | Limited | First-class tensor/pipeline parallel |
| Throughput @ batch | Good | **Excellent** (paged-attention, continuous batching) |
| Setup effort | Low (single binary) | Higher (Python env, CUDA match) |
| Windows native | Yes (`llama-server.exe`) | **No** — Linux/WSL2 only |

**Rule of thumb:** on a single consumer GPU for one interactive user, **llama.cpp
with MTP usually wins** on tokens/sec and simplicity. Reach for vLLM when you need
**FP8/NVFP4 fidelity**, **multi-GPU tensor parallelism**, or **many concurrent
requests**.

## Launch (native Linux — recommended)

```bash
# Install into a fresh venv (match your CUDA toolkit)
uv venv && source .venv/bin/activate
uv pip install vllm

# Serve an OpenAI-compatible endpoint on :8000
vllm serve <model-repo-or-path> \
  --host 0.0.0.0 --port 8000 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --served-model-name my-model
```

Then find the served id and wire it up:

```bash
curl -s http://<VLLM_HOST_IP>:8000/v1/models     # copy the "id"
```

Merge the `vllm-local` block into `~/.config/opencode/opencode.json` (fill in host
IP + served id), then `/model` → **vLLM (local)** in Discord. Everything else is
identical to [connect-local-llm.md](./connect-local-llm.md), including the
`apiKey: "local-no-auth"` requirement (OpenCode only lists providers that carry a
credential).

## NVFP4 / FP8 (why you'd choose vLLM at all)

vLLM can serve **NVFP4** and **FP8** checkpoints, which fit larger models into
32 GB with better fidelity than aggressive GGUF quants:

```bash
vllm serve <nvfp4-model> \
  --host 0.0.0.0 --port 8000 \
  --quantization modelopt \
  --kv-cache-dtype fp8 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.92
```

> **Trade-off:** vLLM has **no built-in MTP** speculative decoding. To recover the
> speed llama.cpp gets from MTP, you must run a separate draft model via
> `--speculative-config '{"model": "<draft>", "num_speculative_tokens": 3}'`,
> which adds VRAM and setup complexity.

## WSL2 — here be dragons (honest verdict)

vLLM runs under WSL2, but in real-world testing on a single 32 GB consumer GPU it
was **not stable enough to recommend as a daily driver**:

<!-- These caveats come from hands-on experience, not theory. -->

- **Instability / crashes** — WSL2 GPU passthrough (`/dev/dxg`) under sustained
  vLLM load produced crashes and hangs that native Windows llama.cpp never hit.
- **VRAM + system-RAM blowout** — vLLM's paged-attention pre-allocation plus
  WSL2's memory model overflowed VRAM into system RAM, tanking throughput.
- **No MTP** — losing llama.cpp's built-in speculative decode erased vLLM's
  throughput edge for single-user interactive use.
- **NVFP4 native on Windows** was not supported at last check, so WSL2 was the
  only path to try it — and the path was painful.

**Verdict:** for a single-GPU interactive Kimaki setup, **native Windows
llama.cpp + MTP beat WSL2 vLLM** on both stability and effective tokens/sec. Use
WSL2 vLLM only if you specifically need NVFP4/FP8 or multi-GPU and are willing to
babysit it.

### If you still want WSL2 vLLM

1. **CUDA-in-WSL is not automatic.** WSL2 injects the base CUDA driver via
   `/usr/lib/wsl/lib`, but you must install a matching CUDA toolkit + the right
   vLLM build inside the distro. GPU is **not** free the way `nvidia-smi` in WSL2
   might suggest.
2. **Cap memory** — set `--gpu-memory-utilization` conservatively (0.85–0.90) and
   watch for spillover; WSL2 will happily thrash system RAM.
3. **Expose on `0.0.0.0`** and reach it from Kimaki via the WSL2 IP (or use
   Windows port-forwarding). Note the JetBrains-style port-mirroring gotcha:
   aggressive WSL2 mirrored-networking changes can break other native tooling.
4. Prefer **native Linux** (bare metal or a dedicated box) over WSL2 for anything
   you depend on.

## Generating a model list

If your vLLM server hosts many models (or you run a gateway), the NVIDIA generator
in this kit works against **any** OpenAI-compatible `/v1/models` endpoint:

```bash
NVIDIA_API_KEY=local-no-auth \
  bun run src/generate-nvidia.ts --base-url http://<VLLM_HOST_IP>:8000/v1
```

If the server is offline the generator fails fast (default 15s; tune with
`--timeout <ms>`) with a clear message instead of hanging.

(The env var is reused as the bearer token; vLLM ignores it unless you configured
auth. Rename the emitted `nvidia-free` block to `vllm-local` before merging.)
