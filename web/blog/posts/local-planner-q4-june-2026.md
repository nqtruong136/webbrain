---
title: >
  Gemma 4 Coder, North Mini Code, DiffusionGemma, and VibeThinker in the WebBrain local planner bench
slug: local-planner-q4-june-2026
sortOrder: 0
date: 2026-06-19
readTime: 8 min read
description: >
  We tested four new local model candidates against WebBrain's frozen first-tool-call browser-agent harness: Gemma 4 12B Coder, Cohere North-Mini-Code, DiffusionGemma, and VibeThinker-3B.
excerpt: >
  Gemma 4 12B Coder and North Mini Code both completed the frozen legacy tool-call bench at Q4. DiffusionGemma ran only through the special diffusion CLI, not llama-server. VibeThinker confirmed its own model-card warning: it is not a browser-agent tool-calling model.
titleTag: >
  Local browser-agent planner bench: Gemma 4 Coder, North, DiffusionGemma, VibeThinker - WebBrain Blog
ogTitle: >
  Local browser-agent planner bench: Gemma 4 Coder, North, DiffusionGemma, VibeThinker
ogDescription: >
  Gemma 4 12B Coder and North Mini Code completed WebBrain's frozen Q4 local planner run; DiffusionGemma is CLI-only for now; VibeThinker is not a tool-calling agent model.
twitterTitle: >
  Local browser-agent planner bench: Gemma 4 Coder, North, DiffusionGemma, VibeThinker
twitterDescription: >
  A practical local-serving pass over four new browser-agent planner candidates for WebBrain.
keywords:
  - WebBrain
  - local LLM
  - browser agent
  - tool calling
  - Gemma 4 12B Coder
  - North-Mini-Code
  - DiffusionGemma
  - VibeThinker-3B
  - llama.cpp
  - vLLM
html: true
lede: >
  We pulled four new local candidates into the WebBrain bench: **Gemma 4 12B Coder Fable5 Composer 2.5**, **Cohere North-Mini-Code 1.0**, **DiffusionGemma-26B-A4B-it**, and **VibeThinker-3B**. The practical result: Gemma and North both completed the frozen legacy first-tool-call run at Q4, DiffusionGemma required a special CLI path that cannot yet run the OpenAI-compatible harness, and VibeThinker matched its own caveat: it is not trained for tool-calling or autonomous agents.
---

## What we ran

This was not a leaderboard run. It was a local-serving reality check: can these models sit behind WebBrain as a first-action browser planner?

For the comparable runs, we used the frozen first-tool-call harness:

```bash
node test/llm/run-llamacpp.mjs \
  --freeze test/llm/freeze/baseline-2026-05-23.json \
  --chat-template-compat alternating \
  --concurrency 1
```

That means:

- 100 single-turn browser-agent prompts.
- The May 23 Claude Sonnet 4.6 WebBrain system prompt and 41-tool schema, frozen.
- Legacy text-call compatibility: no native OpenAI `tools` field is sent.
- One active request at a time.
- `Q4_K_M` GGUFs where a GGUF path exists and can run.

The strict numbers below score only the first model action. **Exact** means tool name and args match the expected first call. **Name** means the tool name matches but args differ. **Parsed calls** measures format reliability, not correctness.

## Results

| Model | Serving path | Parsed calls | Exact | Name | Median | p95 | Observed VRAM | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Gemma 4 12B Coder Fable5 Composer 2.5 | `Q4_K_M` GGUF, llama.cpp, 32k ctx | 94/100 | 9% | 26% | 1.9s | 2.8s | ~8.8-9.0 GB | Clean text run |
| Cohere North-Mini-Code 1.0 | `Q4_K_M` GGUF, llama.cpp b9714, 32k ctx | 93/100 | 9% | 24% | 3.2s | 4.0s | ~19.5 GB | Clean run with parser workaround |
| VibeThinker-3B | BF16, vLLM, 64k ctx, 8 server seqs | 84/100 | 2% | 19% | 5.0s | 15.1s | ~26.8 GB reserved | Scored, but not recommended |
| DiffusionGemma-26B-A4B-it | `Q4_K_M` GGUF, special `llama-diffusion-cli` | n/a | n/a | n/a | n/a | n/a | ~21.3 GB peak smoke | Runs, but not through llama-server |

Two VRAM caveats:

- The llama.cpp numbers are observed desktop readings on an RTX 5090, not isolated lab measurements. They include 32k context, full GPU offload, flash attention where available, q4 KV, and one slot.
- The VibeThinker vLLM number is not the model's minimum memory need. The server was configured with 64k context and 8 concurrent sequences, so vLLM reserved a large GPU pool.

## Gemma 4 12B Coder

Model: [yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF](https://huggingface.co/yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF)

Local file:

```text
G:\llama\models\gemma4-12b-coder\gemma4-coding-Q4_K_M.gguf
```

Gemma was the cleanest llama.cpp run in this batch.

| Metric | Value |
| --- | ---: |
| Completed cases | 100/100 |
| Transport errors | 0 |
| Parsed calls | 94/100 |
| Exact first-call match | 9/100 |
| Tool-name match | 26/100 |
| Average latency | 2.34s |
| Median latency | 1.91s |
| p95 latency | 2.81s |
| Slowest case | 40.5s |
| Observed VRAM | ~8.8-9.0 GB |

The good part is format reliability. Under the frozen legacy path, Gemma emitted parseable calls in 94 cases without transport errors. It was also quick: most requests landed around two seconds.

The weakness is first-action selection. It called `get_accessibility_tree` 57 times out of 100. That is often safe behavior in a real browser session, but this benchmark asks for the expected first action. When the user explicitly asks to go somewhere, search something, or open a known page, "inspect the current blank tab" is usually too conservative.

We also ran `test/vision-probe.mjs` against the same server. The probe failed with:

```text
image input is not supported - hint: if this is unexpected, you may need to provide the mmproj
```

So this particular GGUF is a text planner candidate only in the current setup.

## North Mini Code

Model: [CohereLabs/North-Mini-Code-1.0](https://huggingface.co/CohereLabs/North-Mini-Code-1.0), Q4 GGUF from [bartowski/North-Mini-Code-1.0-GGUF](https://huggingface.co/bartowski/North-Mini-Code-1.0-GGUF)

Local file:

```text
G:\llama\models\north-mini-code-1.0\North-Mini-Code-1.0-Q4_K_M.gguf
```

North loaded successfully in the staged current llama.cpp build:

```text
G:\llama\llama-b9714-cuda13\llama-server.exe
```

But the first smoke test hit a serving-layer problem. With the native template, North generated a sensible action:

```json
[
  {
    "tool_call_id": "0",
    "tool_name": "navigate",
    "parameters": {
      "url": "about:addons"
    }
  }
]
```

llama.cpp's OpenAI endpoint rejected it before returning a normal response:

```text
The model produced output that does not match the expected peg-native format
```

For the comparable run, we restarted the server with `--skip-chat-parsing` and added a narrow raw-action extractor for North/Cohere-style JSON in the runner. The prompt remained the same frozen legacy prompt, and no structured OpenAI tools were sent.

| Metric | Value |
| --- | ---: |
| Completed cases | 100/100 |
| Transport errors | 0 |
| Parsed calls | 93/100 |
| Exact first-call match | 9/100 |
| Tool-name match | 24/100 |
| Average latency | 3.30s |
| Median latency | 3.19s |
| p95 latency | 4.02s |
| Slowest case | 5.16s |
| Observed VRAM | ~19.5 GB |

North was slower and much heavier than Gemma, but more stable than the first template failure suggested. Like Gemma, it strongly preferred `get_accessibility_tree`: 59 of its 93 parsed calls used that tool. It had 7 no-tool answers.

The vision probe failed the same way as Gemma:

```text
image input is not supported - hint: if this is unexpected, you may need to provide the mmproj
```

So North is also text-only in this local run.

## DiffusionGemma

Model: [google/diffusiongemma-26B-A4B-it](https://huggingface.co/google/diffusiongemma-26B-A4B-it), Q4 GGUF from [unsloth/diffusiongemma-26B-A4B-it-GGUF](https://huggingface.co/unsloth/diffusiongemma-26B-A4B-it-GGUF)

Local file:

```text
G:\llama\models\diffusiongemma-26b-a4b-it\diffusiongemma-26B-A4B-it-Q4_K_M.gguf
```

This one is the most interesting runtime story. Standard `llama-server` and `llama-cli` did not load the file in three builds we checked:

- the existing April-era `G:\llama` build,
- `G:\llama-b9286`,
- the staged official Windows CUDA `b9714` build.

All failed with the same architecture error:

```text
unknown model architecture: 'diffusion-gemma'
```

That is expected right now. DiffusionGemma is not a normal autoregressive model, and the GGUF notes point to the DiffusionGemma llama.cpp PR and the dedicated `llama-diffusion-cli` runner. The Hugging Face discussion for the Unsloth GGUF also notes that this path is CLI-only for now, with no `llama-server` support yet.

So we built the PR branch locally:

```text
G:\llama-diffusiongemma\build\bin\llama-diffusion-cli.exe
```

Smoke command:

```bash
llama-diffusion-cli.exe \
  -m G:\llama\models\diffusiongemma-26b-a4b-it\diffusiongemma-26B-A4B-it-Q4_K_M.gguf \
  -p "Explain promises in JavaScript in one sentence." \
  -n 64 \
  -ngl 99 \
  --diffusion-steps 24
```

That worked. It produced a coherent one-sentence answer and peaked around 21.3 GB total 5090 memory in the smoke run. The CLI reported about 1.3s total generation time for the 256-token canvas, using entropy-bound early stopping.

But this is not a WebBrain score. There is no OpenAI-compatible `llama-server` path for this model in the tested builds, and the benchmark harness expects `/v1/chat/completions`. DiffusionGemma is worth revisiting as soon as a server-compatible diffusion runner exists.

## VibeThinker

Model: [WeiboAI/VibeThinker-3B](https://huggingface.co/WeiboAI/VibeThinker-3B)

We tried VibeThinker two ways.

First, we pulled a `Q4_K_M` GGUF and ran it through llama.cpp. Those numbers are discarded. The Q4 run showed repetitive answers, never-ending responses, high latency, and weak tool-call behavior. For a 3B model, this quantization may simply be too lossy for this use case.

Then we reran the BF16 model through vLLM on port 8000. That gave a cleaner data point:

| Metric | Value |
| --- | ---: |
| Completed cases | 100/100 |
| Transport errors | 0 |
| Parsed calls | 84/100 |
| Exact first-call match | 2/100 |
| Tool-name match | 19/100 |
| Average latency | 6.20s |
| Median latency | 4.97s |
| p95 latency | 15.13s |
| Slowest case | 24.4s |
| Observed VRAM | ~26.8 GB reserved by vLLM |

This cleaner run still supports the upstream warning. The VibeThinker model card says it was not trained on tool-calling or agent-based programming data and does not recommend it for function calling, API orchestration, or autonomous coding agents. It recommends competitive-programming-style tasks instead.

That showed up here. VibeThinker emitted calls most of the time, but the first-action routing was weak, no-tool answers were common, and the model often selected generic reading/inspection behavior where the harness expected a concrete browser action.

So the fair interpretation is narrow: VibeThinker may still be interesting for reasoning or competitive-programming prompts, but these WebBrain planner results should not be used as evidence for or against its intended use case.

## What I would keep testing

The practical local candidates from this batch are Gemma 4 12B Coder and North Mini Code.

Gemma is lighter and faster. North is heavier, slightly slower, and needed a parser workaround, but once raw actions were allowed through it completed the full run cleanly. Both have the same exact-match score, and both overuse `get_accessibility_tree`.

That suggests the next useful experiment is prompt-side, not model-side:

- make direct-navigation instructions stronger,
- discourage inspection when the current tab is obviously irrelevant,
- keep the frozen legacy parser path for apples-to-apples comparison,
- rerun Gemma and North after the prompt change.

DiffusionGemma is a separate track. It is the most unusual model in the batch and the smoke result is promising, but it needs an OpenAI-compatible diffusion serving path before it can enter this benchmark honestly.

VibeThinker should stay out of the browser-agent planner table unless a tool-trained variant appears.

## Comparison with earlier planner runs

For context, here is the same strict first-tool comparison across the saved runs we have tested before. This is not the same scoring lens as the May benchmark post, which compared models against consensus and Sonnet. This table replays each saved result against the current `expected/NNN.json` ideal first call: exact is name plus args, name is tool name only.

| Model | Parsed calls | Exact | Name | Median latency |
| --- | ---: | ---: | ---: | ---: |
| MiniMax M2.7 | 88/100 | 23% | 36% | 3.0s |
| Claude Sonnet 4.6 | 92/100 | 19% | 41% | 2.8s |
| Qwen 3.6 35B-A3B | 90/100 | 18% | 38% | 10.3s |
| Qwen 3.6 27B | 92/100 | 18% | 37% | 10.2s |
| Nemotron Omni 30B | 93/100 | 16% | 36% | 2.5s |
| Qwen 3.5 9B | 90/100 | 15% | 35% | 0.91s |
| Gemma 4 E4B | 87/100 | 14% | 35% | 4.5s |
| Intel Gemma 4 31B int4 | 88/100 | 14% | 34% | 0.63s |
| Gemma 4 26B-A4B | 87/100 | 13% | 30% | 1.4s |
| Browser-Use Qwen 30B-A3B Q4 | 93/100 | 12% | 35% | 0.47s |
| Qwen 3.5 4B | 82/100 | 12% | 33% | 5.4s |
| Gemma 4 E2B | 76/100 | 12% | 31% | 3.8s |
| Gemma 4 12B Coder Q4 | 94/100 | 9% | 26% | 1.9s |
| North Mini Code Q4 | 93/100 | 9% | 24% | 3.2s |
| Qwen 3.5 0.8B | 90/100 | 7% | 15% | 0.44s |
| LFM 2.5 | 83/100 | 4% | 23% | 5.9s |
| Qwen 3.5 2B | 89/100 | 4% | 7% | 0.78s |
| VibeThinker 3B BF16 | 84/100 | 2% | 19% | 5.0s |

The new models did not beat the earlier leaders on strict first-action accuracy. Their stronger signal is operational: Gemma 4 12B Coder is light and parseable, while North Mini Code is heavy but also parseable once its native action format is allowed through. Both need prompt work before they can challenge the older Qwen, MiniMax, Sonnet, or Nemotron runs on action selection.
