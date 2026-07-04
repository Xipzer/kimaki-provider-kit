# Kimaki Provider Kit

Provider presets + a self-updating generator for connecting **Kimaki / OpenCode**
to extra model sources:

- **A local LLM** served by llama.cpp (your own GPU)
- **NVIDIA's free** OpenAI-compatible endpoint (100+ open models)

Both endpoints are **already OpenAI-compatible**, so this is pure OpenCode
**provider config** — no shim, no server, no running process. Drop a block into
`~/.config/opencode/opencode.json` and the models show up in the Discord `/model`
picker.

> **Terminology:** this is a **provider preset** kit, not a "plugin" (an OpenCode
> plugin is a JS module in the `plugin[]` array) and not a "shim" (a running
> translator between mismatched APIs). These endpoints speak OpenAI natively, so
> all you need is config.

## What's inside

```
kimaki-provider-kit/
├── src/
│   └── generate-nvidia.ts     Fetch NVIDIA's LIVE catalog -> provider block
├── templates/
│   ├── nvidia-free.provider.json   Ready-to-merge NVIDIA block (key placeholdered)
│   └── local-llama.provider.json   Local llama.cpp block skeleton
├── docs/
│   ├── connect-local-llm.md        Wire a local llama.cpp model into Kimaki
│   ├── connect-nvidia-free.md       Wire NVIDIA's free endpoint into Kimaki
│   └── llama-cpp-cookbook.md        Tuned llama-server launch commands (32 GB GPU)
└── README.md
```

## NVIDIA: generate a fresh model list (never stale)

NVIDIA adds/removes models constantly. Rather than hand-maintain a list, the
generator fetches the **live catalog** and emits a ready provider block:

```bash
bun install

# Print a provider block (key emitted as ${env:NVIDIA_API_KEY} placeholder)
NVIDIA_API_KEY=nvapi-xxxx bun run generate:nvidia

# Write it to a file
NVIDIA_API_KEY=nvapi-xxxx bun run generate:nvidia --out block.json

# Or merge straight into your opencode.json (backs up to opencode.json.bak first)
NVIDIA_API_KEY=nvapi-xxxx bun run generate:nvidia --merge
```

Get a free key at https://build.nvidia.com. The generator filters out non-chat
model families (embeddings, rerankers, speech, vision-encoders, bio/molecular,
OCR, safety/guard, reward), auto-names each model, and flags `reasoning` /
`attachment` where appropriate.

Details: [docs/connect-nvidia-free.md](docs/connect-nvidia-free.md).

## Local LLM: point Kimaki at llama.cpp

1. Serve a model with `llama-server --host 0.0.0.0 --port 8080` (see the
   [cookbook](docs/llama-cpp-cookbook.md) for tuned commands).
2. Merge [templates/local-llama.provider.json](templates/local-llama.provider.json)
   into `opencode.json`, filling in the host IP and the model id from
   `/v1/models`.
3. `/model` in Discord → pick **Local LLM**.

Full walkthrough (incl. the non-obvious gotchas): [docs/connect-local-llm.md](docs/connect-local-llm.md).

## Safety

- **A local model has full tool access** (bash, file read/write). Don't set an
  uncensored model as the **global** default if any channel touches sensitive
  repos. Prefer **session scope** in a dedicated thread.
- **Never commit your NVIDIA key.** The generator's printed output uses a
  `${env:NVIDIA_API_KEY}` placeholder; only `--merge` writes a real key, and only
  into your local `opencode.json` (gitignored `.bak`).

## Companion project

For **local voice-note transcription** (a real shim), see
[kimaki-whisper-shim](https://github.com/Xipzer/kimaki-whisper-shim).

## License

MIT — see [LICENSE](LICENSE).
