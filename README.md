# SwarmCast

Real-time wisdom-of-crowds forecasting: 50 persona-driven LLM agents estimate the probability of a yes/no question in parallel, and a deterministic aggregator combines their answers into a single forecast with a measured spread.

SwarmCast was built for a Cerebras x Google DeepMind Gemma 4 hackathon. The thesis is that fanning out ~50 independent model calls per question only feels interactive on very fast inference, so the app includes a side-by-side latency comparison between Cerebras (Gemma 4 31B by default) and a standard OpenAI-compatible GPU API.

## Features

- **50-agent forecasting swarm.** Each agent is assigned one of 50 fixed personas (reasoning style, risk posture, time horizon, sampling temperature) so the agents reach genuinely different estimates.
- **Live streaming.** Agents run in batches of 10, and each batch is streamed to the browser over Server-Sent Events as soon as it completes.
- **Animated swarm visualization.** Agent dots fan out while "thinking", then move into a 10-bin probability histogram as their results arrive. A marker shows the aggregate and a shaded band shows the 10th-90th percentile range.
- **Deterministic aggregation.** The final forecast is computed in code, not by a model: invalid outputs are dropped, the top and bottom 10% are trimmed, and the rest are combined with a confidence-weighted mean.
- **Confidence derived from disagreement.** The high/moderate/low label is computed from the measured standard deviation of the agents' estimates.
- **Synthesized summary.** One final model call writes a headline forecast, a consensus summary, and the main point of disagreement.
- **Agent detail panel.** Click any dot to see that agent's persona, probability, self-reported confidence, and key factor.
- **Provider comparison.** A toggle reruns the identical swarm (same prompts, schema, swarm size, and batch size) against a baseline OpenAI-compatible provider. TTFT, total wall-clock time, agents/sec, and tokens/sec are measured and displayed for each.

## How it works

```
question
   |
   v
Moderator (1 call)        -> structured spec: type, resolution criteria, bounds, horizon
   |
   v
Forecasters (50 calls)    -> 5 batches of 10 via Promise.allSettled, each batch streamed as SSE
   |
   v
Aggregator (pure code)    -> trimmed, confidence-weighted mean; median; stddev; IQR; p10/p90; bins
   |
   v
Synthesizer (1 call)      -> headline, consensus summary, main disagreement
```

A question costs 52 model calls in total.

### Agents and structured output

All three agent roles (moderator, forecaster, synthesizer) use the official `openai` Node SDK against an OpenAI-compatible endpoint. They request `response_format: json_schema` with `strict: true`, and every response is validated with Zod. If parsing or validation fails, the call is retried once with a terse "return only valid JSON" prompt at low temperature. If the retry also fails, that agent is dropped. Because the swarm uses `Promise.allSettled`, a failed agent never blocks the rest, and the aggregator reports how many agents were dropped.

Each forecaster returns `probability`, `confidence` (0-1), a one-line `key_factor`, and the `reasoning_style` it used. The schemas also include fields for numeric questions (`point_estimate`, `low`, `high`), but aggregation and visualization currently use only `probability`, so in practice the app supports binary questions only.

### Aggregation (`lib/aggregator.ts`)

1. Keep outputs whose `probability` and `confidence` both fall in [0, 1].
2. Sort by probability and compute p10, p25, median, p75, and p90.
3. Trim the lowest and highest 10% of results.
4. Compute a confidence-weighted mean over the trimmed set. If every remaining confidence is zero, fall back to an unweighted mean.
5. Compute the standard deviation and IQR over all valid results. Spread is `min(stddev / 0.5, 1)`, and the label is `high` when spread < 0.25, `moderate` when it is < 0.5, and `low` otherwise.
6. Bucket every valid probability into ten 10% bins for the histogram.

### Latency metrics

The server measures wall-clock time for the whole swarm and the time until the first agent result arrives. Per-call duration comes from the provider's `time_info` field when it is present (Cerebras returns it) and from client-side timing otherwise. Tokens/sec uses `usage.completion_tokens`. All numbers are measured live; none are hardcoded.

## Tech stack

- Next.js 16 (App Router) with a Node.js runtime route handler
- React 19, TypeScript
- Tailwind CSS v4
- `openai` SDK v6, used as a generic OpenAI-compatible client
- Zod v4 for output validation
- Hand-written SVG for the visualization (no charting library)
- Models: Cerebras Inference with `gemma-4-31b` by default. The baseline is any OpenAI-compatible endpoint (`gpt-4o-mini` on the OpenAI API by default).

There is no database, authentication, or persistence. Each run's state lives in memory.

## Prerequisites

- Node.js 20 or later
- npm
- A Cerebras API key
- (Optional) An API key for a second OpenAI-compatible provider, used by the comparison toggle

## Setup

```bash
npm install
```

Create `.env.local` in the project root. `.gitignore` already excludes `.env*`.

```bash
# Required: primary swarm provider
CEREBRAS_API_KEY=your-cerebras-api-key
# Optional overrides (defaults shown)
CEREBRAS_BASE_URL=https://api.cerebras.ai/v1
CEREBRAS_MODEL=gemma-4-31b

# Required only for the "Standard GPU API" toggle and npm run smoke:both
BASELINE_API_KEY=your-baseline-api-key
# Optional overrides (defaults shown)
BASELINE_BASE_URL=https://api.openai.com/v1
BASELINE_MODEL=gpt-4o-mini
```

API keys are read only on the server, in `lib/providers.ts` and the API route. They are never sent to the browser.

## Running

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run smoke` | Make one forecaster call to Cerebras and validate it against the schema (reads `.env.local`) |
| `npm run smoke:both` | Run the same single call against Cerebras and the baseline provider |
| `npm run test:agg` | Run the unit tests for the deterministic aggregator |

`scripts/swarm-bench.ts` is a separate benchmark with no npm script. It streams a full swarm run from a running dev server and prints timings. The endpoint is hardcoded to `http://localhost:3001/api/swarm`, so either start the dev server on port 3001 (`npm run dev -- -p 3001`) or edit the URL first. Then run:

```bash
npx tsx --env-file=.env.local scripts/swarm-bench.ts
```

## API

`POST /api/swarm`

```json
{ "question": "Will global EV sales exceed 40% of new car sales in 2027?", "provider": "cerebras" }
```

`provider` is `"cerebras"` or `"baseline"`; any other value falls back to `"cerebras"`. The response is a `text/event-stream`. Each `data:` line holds a JSON object whose `type` is one of: `status`, `context` (moderator output), `batch` (agent results for one batch), `aggregate` (aggregate stats plus latency), `synthesis`, `done`, or `error`.

## Project structure

```
app/
  api/swarm/route.ts      SSE endpoint: moderator -> batched swarm -> aggregate -> synthesizer
  page.tsx                Main client UI: question input, provider toggle, SSE consumer
  layout.tsx, globals.css
components/
  SwarmViz.tsx            SVG fan-out -> histogram animation with clickable agent dots
  ForecastCard.tsx        Headline forecast, summary, disagreement, confidence label
  LatencyBar.tsx          TTFT / total time / agents/sec / tokens/sec, with comparison
  AgentDetailPanel.tsx    Detail view for a selected agent
lib/
  swarm.ts                Prompts, structured-output calls with one repair retry
  personas.ts             The 50 persona definitions
  aggregator.ts           Deterministic aggregation and latency stats
  schemas.ts              Zod schemas and matching JSON Schemas for each agent role
  providers.ts            OpenAI-compatible client factory for Cerebras and baseline
  __tests__/aggregator.test.ts
scripts/
  smoke-test.ts           Single Cerebras call
  smoke-test-baseline.ts  Single call against both providers
  swarm-bench.ts          End-to-end swarm benchmark against a running server
plan-swarmcast.md         Original design and build plan
```

## Limitations

- Only binary (probability) questions are aggregated and visualized. The numeric-question schema fields exist but are not used downstream.
- The swarm size (50) and batch size (10) are constants in `app/api/swarm/route.ts`.
- The route sets `maxDuration = 120` seconds. A slow baseline provider can approach that limit.
