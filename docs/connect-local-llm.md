# Connect Kimaki / OpenCode to a local LLM (llama.cpp)

Wire a local LLM served by `llama-server` (llama.cpp) — or any OpenAI-compatible
endpoint — into Kimaki as a selectable model via the Discord `/model` command.

No shim, no server, no code: llama.cpp is **already OpenAI-compatible**, so this
is pure OpenCode **provider config**. Use [templates/local-llama.provider.json](../templates/local-llama.provider.json).

## 0. Prerequisites

- Local LLM served by `llama-server` (or any endpoint exposing `/v1/models` and
  `/v1/chat/completions`), started with `--host 0.0.0.0` (reachable over LAN).
- OpenCode installed (`opencode --version`); Kimaki runs on top of it.

> **Critical:** `localhost:8080` is only localhost *from the LLM box*. If Kimaki
> runs on a different machine, use the LLM host's **LAN IP**
> (e.g. `http://<LLM_HOST_IP>:8080/v1`), never `localhost`.

## 1. Find the model id + context

From the machine where Kimaki runs:

```bash
curl -s -m 6 http://<LLM_HOST_IP>:8080/v1/models
```

Record the exact model **`id`** (usually the GGUF filename) and `meta.n_ctx`
(the loaded context window). If `curl` fails, confirm `--host 0.0.0.0`, firewall,
and network before proceeding.

## 2. Add the provider block

Merge the `llama-local` block from the template into
`~/.config/opencode/opencode.json`, preserving all existing keys. Fill in
`<LLM_HOST_IP>` and `<MODEL_ID_FROM_/v1/models>`.

| Field | Why it matters |
|---|---|
| `"npm": "@ai-sdk/openai-compatible"` | Uses the OpenAI-compatible adapter. |
| `"apiKey": "local-no-auth"` | **Critical.** OpenCode only lists providers in `/model` if they have *some* credential. llama-server ignores the value; without it the provider won't appear. |
| `baseURL` ending in `/v1` | OpenAI-compatible route prefix. |
| `"tools": true` | Enables tool/function-calling (bash/read/write). Required for agentic use. |
| `"reasoning": false` | Most local GGUFs expose no reasoning channel; leaving it on can break parsing. |
| model key = `<MODEL_ID>` | Must match `/v1/models` `id` exactly or requests 404. |

## 3. Verify

```bash
opencode models 2>/dev/null | grep llama-local     # expect: llama-local/<MODEL_ID>
```

Nothing printed? Re-check the `apiKey` is present (most common cause) and that the
JSON is valid (`jq . opencode.json`).

Prove the tool loop works (listing != working):

```bash
mkdir -p /tmp/llm-toolcheck && cd /tmp/llm-toolcheck
opencode run --model "llama-local/<MODEL_ID>" \
  "Create a file called ok.txt containing 'tools work', then read it back."
cat /tmp/llm-toolcheck/ok.txt      # expect: tools work
```

## 4. Select it in Discord

`/model` → pick provider **Local LLM** → pick the model → choose scope (session /
channel / global). If it doesn't appear, restart Kimaki so it re-reads the config.

## 5. Context window guidance

Local models have a fixed ceiling = the server's `-c` value. Exceeding it makes
llama.cpp reject the whole request. Mitigations: keep sessions short; disable
unused skills (`--disable-skill <name>`); or raise `-c` up to `n_ctx_train`
(costs more KV-cache VRAM).

## 6. Safety

- Kimaki's **entire control plane** runs through the selected model — every tool
  call, file op, scheduling. A small local model degrades on long tool loops.
- The model has **full tool access** (bash, file read/write). An
  "uncensored"/"abliterated" model won't refuse anything — do NOT set it as
  **global default** if any channel touches sensitive repos (keys, trading bots).
- **Recommended:** keep a cloud model as global default; switch to the local
  model with **session scope** only, in a dedicated thread/directory.

## 7. Rollback

Delete the `"llama-local"` block from `~/.config/opencode/opencode.json` and
restart Kimaki. No other files are modified.
