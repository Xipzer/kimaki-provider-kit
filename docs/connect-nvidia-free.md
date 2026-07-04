# Connect Kimaki / OpenCode to NVIDIA's free endpoint

NVIDIA hosts a large catalog of open models behind an **OpenAI-compatible**
endpoint (`https://integrate.api.nvidia.com/v1`) with a free tier. Because it's
already OpenAI-compatible, this is pure OpenCode **provider config** — no shim.

## 1. Get a free key

Sign up at https://build.nvidia.com and create an API key (starts with `nvapi-`).

> The free tier has rate limits. Fine for light/interactive use; not for
> high-volume automation.

## 2. Generate the provider block (recommended — never stale)

NVIDIA adds/removes models frequently. Instead of hand-maintaining a model list,
run the generator, which fetches the **live catalog** and emits a ready block:

```bash
NVIDIA_API_KEY=nvapi-xxxx bun run src/generate-nvidia.ts            # print to stdout
NVIDIA_API_KEY=nvapi-xxxx bun run src/generate-nvidia.ts --out block.json
NVIDIA_API_KEY=nvapi-xxxx bun run src/generate-nvidia.ts --merge    # merge into opencode.json
```

- `--merge` backs up `opencode.json` to `opencode.json.bak`, preserves all other
  providers, and writes your key into the local config.
- Without `--merge`, the printed/file output uses `${env:NVIDIA_API_KEY}` as a
  placeholder so you never accidentally commit your key.
- `--all` keeps every model (skips the chat-only filter).

The generator filters out non-chat families (embeddings, rerankers, speech,
vision-encoders, bio/molecular, OCR, safety/guard, reward), auto-generates
display names, and flags `reasoning`/`attachment` per model.

## 3. Or copy the static template

[templates/nvidia-free.provider.json](../templates/nvidia-free.provider.json) is a
committed snapshot (key placeholdered). Merge its `nvidia-free` block into
`~/.config/opencode/opencode.json` and replace `${env:NVIDIA_API_KEY}` with your
key (or set the env var). Note: a static snapshot rots — prefer the generator.

## 4. Verify

```bash
opencode models 2>/dev/null | grep -c '^nvidia-free/'    # count of listed models
```

Then in Discord: `/model` → provider **Nvidia (Free)** → pick a model.

## 5. Notes

- Some very large models (e.g. 600B+ MoE) have slow cold-starts on the free tier —
  the first request can time out, then warm up. This is a runtime latency issue,
  not a config error.
- Reasoning models return their thinking in a separate channel; the generator
  marks them `reasoning: true` so OpenCode parses them correctly.
