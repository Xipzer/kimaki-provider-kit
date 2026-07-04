#!/usr/bin/env bun
// Generate an OpenCode "nvidia-free" provider block by fetching NVIDIA's LIVE
// model catalog, so the model list is never stale.
//
//   NVIDIA_API_KEY=nvapi-xxxx bun run src/generate-nvidia.ts            # print block
//   NVIDIA_API_KEY=nvapi-xxxx bun run src/generate-nvidia.ts --merge    # merge into opencode.json
//
// Flags:
//   --merge            merge the block into ~/.config/opencode/opencode.json
//                      (backs up to opencode.json.bak first; preserves other providers)
//   --out <file>       write the block JSON to a file instead of stdout
//   --all              keep every model (skip the chat-only filter)
//   --base-url <url>   override endpoint (default https://integrate.api.nvidia.com/v1)
//
// NVIDIA's free tier is OpenAI-compatible, so no shim/server is needed — this is
// pure config. The key is only used to LIST models; it is not embedded unless you
// pass --merge (which writes it into your local opencode.json).

import { homedir } from "node:os";
import { join } from "node:path";

const BASE_URL =
  argValue("--base-url") ?? "https://integrate.api.nvidia.com/v1";
const API_KEY = process.env.NVIDIA_API_KEY ?? "";

if (!API_KEY) {
  console.error(
    "error: set NVIDIA_API_KEY (get a free key at https://build.nvidia.com).",
  );
  process.exit(1);
}

// Model families that are NOT usable as chat models in the /model picker:
// embeddings, rerankers, speech, vision-encoders, bio/molecular, OCR, retrieval,
// reward, safety/guard, PII, video-detect, parse, calibration.
const EXCLUDE = [
  "embed", "embedding", "rerank", "reranking", "nv-embed", "nvclip", "bge-",
  "ocdrnet", "retail", "parakeet", "riva", "fastpitch", "hifigan", "-stt", "-tts",
  "audio2face", "maxine", "genmol", "molmim", "proteinmpnn", "esmfold", "diffdock",
  "alphafold", "rfdiffusion", "fuyu", "kosmos", "neva", "vila", "florence",
  "paddleocr", "deplot", "cuopt", "nemoretriever",
  "guard", "content-safety", "topic-control", "jailbreak", "aegis", "gliner",
  "reward", "nemotron-parse", "synthetic-video-detector", "ising-calibration",
  "chatqa", "recurrentgemma", "diffusiongemma",
];

// Substrings that mark a model as reasoning/thinking-capable.
const REASONING = [
  "nemotron", "deepseek-v4", "deepseek-r", "qwen3.5", "qwen3-next", "gpt-oss",
  "minimax", "glm-5", "step-3", "cosmos-reason", "jamba", "phi-4", "seed-oss",
  "mistral-large-3", "mistral-medium-3", "mistral-small-4",
];

// Substrings that mark a model as vision/multimodal (attachment support).
const VISION = ["vision", "-vl-", "-vl", "multimodal", "nano-omni", "maverick"];

type NvModel = { id: string };
type ModelEntry = {
  name: string;
  tools: true;
  reasoning: boolean;
  attachment?: true;
};

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}
function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function keepModel(id: string): boolean {
  const low = id.toLowerCase();
  return !EXCLUDE.some((s) => low.includes(s));
}

// Turn "mistralai/mistral-medium-3.5-128b" into "Mistral Medium 3.5 128B".
function displayName(id: string): string {
  const name = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  const cleaned = name
    .replace(/-instruct/g, "")
    .replace(/-it\b/g, "")
    .replace(/[_-]/g, " ")
    .trim();
  const UPPER = new Set([
    "gpt", "oss", "glm", "vl", "moe", "fin", "med", "sea", "ai", "llm", "pro",
  ]);
  return cleaned
    .split(/\s+/)
    .map((tok) => {
      const t = tok.toLowerCase();
      if (UPPER.has(t)) return tok.toUpperCase();
      // sizes like 70b, 8x22b, 397b
      if (/^\d+(\.\d+)?b$/.test(t)) return tok.toUpperCase();
      if (/x/.test(t) && /\d/.test(t)) return tok.toUpperCase();
      return tok.charAt(0).toUpperCase() + tok.slice(1);
    })
    .join(" ")
    .trim();
}

function toEntry(id: string): ModelEntry {
  const low = id.toLowerCase();
  const entry: ModelEntry = {
    name: displayName(id),
    tools: true,
    reasoning: REASONING.some((r) => low.includes(r)),
  };
  if (VISION.some((v) => low.includes(v))) entry.attachment = true;
  return entry;
}

async function fetchModels(): Promise<string[]> {
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`NVIDIA /models ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: NvModel[] };
  return data.data.map((m) => m.id).sort();
}

function buildBlock(ids: string[], apiKey: string) {
  const keep = argFlag("--all") ? ids : ids.filter(keepModel);
  const models: Record<string, ModelEntry> = {};
  for (const id of keep) models[id] = toEntry(id);
  return {
    "nvidia-free": {
      npm: "@ai-sdk/openai-compatible",
      name: "Nvidia (Free)",
      options: { baseURL: BASE_URL, apiKey },
      models,
    },
  };
}

async function main() {
  const ids = await fetchModels();
  const block = buildBlock(ids, API_KEY);
  const count = Object.keys(block["nvidia-free"].models).length;

  if (argFlag("--merge")) {
    const cfgPath = join(homedir(), ".config/opencode/opencode.json");
    const cfg = JSON.parse(await Bun.file(cfgPath).text());
    await Bun.write(`${cfgPath}.bak`, JSON.stringify(cfg, null, 2));
    cfg.provider = { ...(cfg.provider ?? {}), ...block };
    await Bun.write(cfgPath, JSON.stringify(cfg, null, 2));
    console.error(`merged ${count} models into ${cfgPath} (backup: ${cfgPath}.bak)`);
    return;
  }

  // In printed/file output, keep the key as a placeholder so users don't
  // accidentally commit their real key.
  const printable = buildBlock(ids, "${env:NVIDIA_API_KEY}");
  const out = argValue("--out");
  const json = JSON.stringify({ provider: printable }, null, 2);
  if (out) {
    await Bun.write(out, json + "\n");
    console.error(`wrote ${count} models to ${out}`);
  } else {
    console.log(json);
    console.error(`\n// ${count} chat models. Replace \${env:NVIDIA_API_KEY} or set the env var.`);
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
