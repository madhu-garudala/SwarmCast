# SwarmCast — Real-Time Swarm Forecasting Engine

**A 50-agent wisdom-of-crowds prediction swarm that only works because Cerebras is fast**
Cerebras × Google DeepMind Gemma 4 24-Hour Hackathon (Jun 28–29, 2026)
**Target track: Track 1 — Multiverse Agents** (separate build from PulseOps/FlashOps; do not touch that codebase)

---

## 0. Read this first — this is a one-shot build

This file is the **single source of truth**. Claude Code should implement it
end-to-end in one pass, de-risking the fragile parts first. The plan is already
locked — **do not re-architect it.** When a decision is ambiguous, prefer the
choice that makes the **60-second demo** more reliable, not the one that makes
the product more complete. We are shipping a polished demo, not a product.

**One-line thesis the whole project must prove:**
> A useful forecast is the *aggregate* of many independent reasoners. Doing that
> live — 50 LLM agents each reasoning, betting, and updating in seconds — is only
> possible because Cerebras runs Gemma 4 31B fast enough to fan out a whole swarm
> and still feel instant. On a conventional GPU-hosted OpenAI-compatible API, the
> same swarm crawls.

**Why this wins Track 1 (Multiverse Agents):**
- It is *literally* a swarm: 30–60 agents, each an independent "world-line" of
  reasoning, running concurrently.
- Emergent behavior is real and unscripted: you watch a distribution form,
  disagree, and converge.
- The speed story is intrinsic, not bolted on — the product *cannot exist*
  without fast inference. That's the strongest possible Cerebras narrative.

**The 60-second demo arc:**
> Type a forecastable question → 50 agent dots fan out and start reasoning →
> a live histogram of their probability estimates forms and tightens →
> a calibrated aggregate forecast snaps into place with a confidence band →
> toggle "Run on standard GPU API" and watch the same swarm visibly crawl.

---

## 1. Secrets / API key handling — DO THIS RIGHT

- **Reuse the existing `.env.local` from the PulseOps project.** Copy it into this
  new project's root. The user will update/rotate keys as needed.
- Required env vars:
  - `CEREBRAS_API_KEY` — primary swarm provider.
  - `CEREBRAS_BASE_URL` — default `https://api.cerebras.ai/v1` (OpenAI-compatible).
  - `CEREBRAS_MODEL` — default `gemma-4-31b`.
  - `BASELINE_API_KEY` — the comparison provider's key (OpenAI-compatible GPU host).
  - `BASELINE_BASE_URL` — e.g. `https://api.openai.com/v1` or another GPU-hosted
    OpenAI-compatible endpoint. **The user will fill this in / update keys.**
  - `BASELINE_MODEL` — a *comparable* open model on the baseline host (see §6).
- The key is **never** hardcoded into any file, commit, or UI.
- Read everything from the environment. **Confirm `.env*` is in `.gitignore`
  before the first commit.** Verify the line exists; do not assume.
- All provider calls happen **server-side only** (Next.js route handlers / server
  actions). The browser never sees a key.
- During demo recording, ensure no key, token, env file, notification, or email
  is ever visible on screen (hackathon rule).

**IMPORTANT — do not run git.** The user handles ALL git operations personally.
Claude Code must not run `git add`, `git commit`, `git push`, or any other git
command. Stage files on disk only.

**Cerebras request shape (confirmed against live docs, Jun 2026):**
Cerebras is drop-in OpenAI-compatible. Use the official `openai` TS SDK pointed
at the Cerebras base URL — no special client needed.

```ts
import OpenAI from "openai";

const cerebras = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY!,
  baseURL: process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1",
});

const res = await cerebras.chat.completions.create({
  model: process.env.CEREBRAS_MODEL ?? "gemma-4-31b",
  messages: [{ role: "system", content: SYS }, { role: "user", content: USER }],
  temperature: 0.9,          // we WANT diversity across the swarm — see §4
  max_completion_tokens: 512, // each agent's reasoning is short; keep it tight
  top_p: 1,
});
```

> Before writing orchestration code, **confirm the current Cerebras TS usage,
> structured-output parameters, and `usage`/timing fields against the official
> docs** (linked from the hackathon PDF). Do not rely on memory for request
> shapes — pin them to current docs. The baseline provider uses the *identical*
> OpenAI client with a different `baseURL`/`apiKey`/`model`, so a single
> `makeClient(provider)` factory covers both.

---

## 2. Stack (locked)

- Next.js (App Router) + TypeScript
- Tailwind + shadcn/ui
- `openai` official TS SDK (same client class for both providers — just swap config)
- `zod` for strict output validation (one repair retry per agent — see §4)
- Charting: **lightweight, no heavy deps.** Prefer hand-rolled SVG bars or
  `recharts` if already trivial. The histogram must update smoothly at high
  frequency, so prefer plain SVG you control over a chart lib that re-mounts.
- Vercel for deploy (local dev is fine for the demo; deploy only if time permits,
  pin production to the last known-good commit — the user controls git).
- **No database, no auth, no persistence.** Everything is in-memory per session.
  (Cut item — see §8.)
- **No agent framework** (no LangGraph/LangChain). Orchestrate the swarm with
  plain TypeScript + `Promise.all` batching.

---

## 3. Product concept

A web app where the user asks a **forecastable yes/no or numeric question**, and a
swarm of 50 independent AI forecasters each:
1. reasons briefly from an assigned *persona / reasoning style*,
2. emits a probability (for binary) or a point estimate + range (for numeric),
3. emits a confidence weight and a one-line rationale.

The system then **aggregates** them into a single calibrated forecast — using a
confidence-weighted, outlier-trimmed mean — that is more robust than any single
agent. You watch the whole distribution form and converge **live**.

**Example demo questions (pick the sample carefully — see §9):**
- "Will a privately-built spacecraft land humans on the Moon before 2030?"
- "What will global EV sales be as a % of new car sales in 2027?"
- "Will [some sports/market/tech event with genuine uncertainty] happen by X?"

**Why a swarm and not one agent:** a single LLM gives one anchored guess. Fifty
agents with diverse priors produce a *distribution*, and the aggregate of a
diverse crowd is empirically better calibrated than any individual. The product
visibly demonstrates wisdom-of-crowds — and it's only live-able because Cerebras
can run all 50 in the time a GPU host runs a handful.

---

## 4. Swarm architecture (locked — plain TS, Promise.all batching)

### The agents
- **N = 50 forecaster agents** by default (make it a constant `SWARM_SIZE`, easy
  to dial 30–60 for demo tuning / latency).
- Each agent is the **same TS function** with a different injected **persona**.
  Personas drive genuine diversity of reasoning (this is what makes the
  distribution real, not 50 identical answers).
- Persona dimensions to vary (precompute a list of 50 persona seeds):
  - **Reasoning style:** base-rate-first, inside-view storyteller, contrarian,
    trend-extrapolator, reference-class forecaster, skeptic, optimist, etc.
  - **Risk posture:** cautious vs aggressive.
  - **Time-horizon weighting:** near-term anchored vs long-term.
  - **Temperature jitter:** vary `temperature` slightly per agent (0.7–1.05) so
    even same-persona agents diverge.
- Keep each agent prompt **tiny and focused**. Short reasoning, hard cap on
  tokens (~512). Fifty small calls beat fifty big ones for the live feel.

### The flow
```
question
   │
   ▼
[Moderator] normalizes the question → {type: binary|numeric, resolution_criteria, unit, bounds}
   │
   ▼
fan out  ──►  50 × [Forecaster_i]  (Promise.all, batched)  ──►  50 predictions
   │
   ▼
[Aggregator] (deterministic CODE, not a model):
     - drop unparseable / out-of-range
     - confidence-weighted mean
     - trim top/bottom 10% (outlier robustness)
     - compute spread / disagreement metric
   │
   ▼
[Synthesizer] (ONE model call): given the aggregate + the spread + a sample of
     dissenting rationales, write a 2–3 sentence human forecast summary naming
     the crowd's consensus AND the main source of disagreement.
```

### Critical orchestration detail — batched fan-out
Do **not** fire 50 calls in a single unbounded `Promise.all` (you'll hit rate
limits and the UI can't stream). Batch them:

```ts
async function runSwarm(agents, onResult, batchSize = 10) {
  for (let i = 0; i < agents.length; i += batchSize) {
    const batch = agents.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(a => runForecaster(a)));
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") onResult(agents[i + j].id, r.value);
      // rejected → skip; the aggregate tolerates dropouts (that's the point)
    });
    // stream each batch's results to the client as they land
  }
}
```
- `Promise.allSettled` (not `all`) so one bad agent never kills the swarm.
- Stream results to the client **per batch** (via a streamed Response / SSE / or
  incremental fetch) so the histogram visibly fills in waves — this IS the wow.
- Tune `batchSize` to the provider's concurrency limit; confirm against docs.

### Agent I/O contracts (strict JSON, Zod-validated, one repair retry each)

**Moderator** (1 call, runs first)
```json
{
  "question_type": "binary | numeric",
  "resolution_criteria": "string",
  "unit": "string | null",
  "lower_bound": 0,
  "upper_bound": 0,
  "horizon": "string"
}
```

**Forecaster_i** (×50, the swarm)
```json
{
  "probability": 0.0,          // for binary: 0..1   (null for numeric)
  "point_estimate": 0.0,       // for numeric        (null for binary)
  "low": 0.0,                  // numeric 80% range low  (null for binary)
  "high": 0.0,                 // numeric 80% range high (null for binary)
  "confidence": 0.0,           // 0..1 self-assessed weight
  "key_factor": "string",      // one-line driving rationale
  "reasoning_style": "string"  // echo the assigned persona for display
}
```
> Validate defensively. If `probability` is out of [0,1] or the JSON is broken,
> run **one** repair retry with a terse "return valid JSON only" reprompt; if it
> still fails, **drop that agent** — the swarm is robust to dropouts by design.
> Never block the aggregate on a single agent.

**Aggregator** — **deterministic code, NOT a model call.** This is a signature
"the system is honest" moment. It:
- filters invalid/out-of-range outputs,
- computes a **confidence-weighted mean**,
- **trims** the top/bottom 10% to resist outliers,
- computes a **disagreement / spread** metric (std dev or IQR),
- buckets predictions into histogram bins for display.

**Synthesizer** (1 call, runs last)
```json
{
  "headline_forecast": "string",   // e.g. "~68% likely"
  "consensus_summary": "string",   // 2-3 sentences
  "main_disagreement": "string",   // what the dissenters believe and why
  "confidence_label": "high | moderate | low"  // derived from spread
}
```

**Total model calls:** 1 (Moderator) + 50 (Forecasters) + 1 (Synthesizer) = **52**.
That 50-wide fan-out is the entire point — and the entire reason a slow API looks
bad (§6).

---

## 5. The honest-uncertainty principle (locked)

- The aggregate is only meaningful if the agents genuinely **disagree**. Pick a
  sample question with **real** uncertainty (see §9) so the histogram is a spread,
  not a spike.
- **Never fake the distribution.** Display the real spread. If 50 agents all say
  90%, show that — but choose a demo question where they won't, so the
  convergence story is visible and honest.
- The `confidence_label` is **derived from the measured spread**, not hardcoded.
  Tight spread → "high"; wide spread → "low". This must be computed live.

---

## 6. Latency / baseline strategy — "looks bad on the standard GPU API" (locked & HONEST)

This is the headline visual. It must be **fair**, or judges will discount it.

**The comparison must be apples-to-apples:**
- **Same prompt, same swarm size, same schema, same batch size, same code path.**
  The ONLY difference is the provider config (`baseURL` / `apiKey` / `model`).
- Use a **comparable** model on the baseline (a real GPU-hosted OpenAI-compatible
  model of similar class). **Do not pick a deliberately weak or tiny baseline** —
  a credible ~3–10x slower beats a suspicious 50x. The honest result is already
  dramatic: fanning out 50 calls is exactly where Cerebras's tokens/sec advantage
  **compounds**, because total wall-clock = (batches) × (per-call latency), and
  per-call latency is where Cerebras wins big.
- **Never hardcode benchmark numbers.** Measure and display **real** values:
  - **TTFT** (time to first agent result landing),
  - **total swarm wall-clock** (question submit → aggregate ready),
  - **agents/sec** (throughput of the fan-out),
  - **tokens/sec** if the provider returns usage/timing.
- Cerebras responses include usage stats and timing info — capture and show them.

**Why the standard API "looks bad" here — and why that's legitimate:**
A swarm of 50 calls magnifies per-call latency. If Cerebras finishes a batch of
10 in ~0.4s and the GPU host takes ~3–4s per batch, the full 50-agent swarm is
the difference between "the histogram fills in front of you" and "you wait,
bored, watching a spinner." That contrast is the product thesis made visible. We
are not crippling the baseline — we're showing that **only fast inference makes a
live swarm feel live.**

**Demo toggle:** a single control — `[ Cerebras ] / [ Standard GPU API ]` — that
re-runs the identical swarm. Run Cerebras live. Run the baseline live if stable;
if the baseline provider is flaky or rate-limited mid-demo, fall back to an
**honestly pre-recorded** baseline run (clearly the same question, same swarm),
never a fabricated number. Capture a real baseline run early as insurance.

---

## 7. The one beautiful moment (locked UI posture)

Everything can be clean shadcn defaults **except one moment**, which must feel
premium:

> The user submits a question → **50 agent dots fan out** from a center point and
> begin "thinking" (subtle pulse) → as each batch returns, **dots fly into their
> bin** on a live histogram → the histogram **tightens and a confidence band
> forms** → the aggregate forecast **snaps into place** with the headline number
> and the consensus/dissent summary.

Suggested layout:
- **Top:** the question input + the `Cerebras / Standard GPU API` toggle.
- **Center (the hero):** the swarm visualization.
  - Phase 1: 50 dots fanned out, pulsing as they reason.
  - Phase 2: dots animate into a **live histogram** of probability/estimate bins,
    filling in waves as batches land.
  - Phase 3: a vertical line marks the **aggregate**, a shaded band marks the
    **80% range / spread**.
- **Right:** the forecast card — headline %, consensus summary, main
  disagreement, confidence label. Snaps in last.
- **Bottom:** the **live latency bar** — TTFT / total wall-clock / agents-per-sec,
  Cerebras vs baseline, real measured values only.

Spend the entire polish budget on the **fan-out → histogram → snap** transition.
Nothing else needs to be beautiful. The dots-flying-into-bins animation is the
single thing judges will remember.

**Animation honesty:** the dots should land **as real results arrive** (driven by
the streamed batches), not on a fake timer. The visual *is* the live computation.

---

## 8. Scope: protect vs cut

**Protect at all costs:**
1. The 50-agent fan-out via `Promise.allSettled` batching (the swarm itself).
2. Streaming results to the client per batch (so the histogram fills live).
3. Deterministic confidence-weighted, outlier-trimmed aggregation (honest math).
4. Live, real, measured latency — Cerebras vs baseline.
5. The one beautiful fan-out → histogram → snap transition.
6. One perfect sample question with genuine, visible disagreement.

**Cut first (in this order) if behind:**
1. The Synthesizer call (replace with a templated summary from the aggregate
   numbers — the histogram already tells the story).
2. Numeric-question support (ship **binary-only**; it's simpler to bin and
   animate, and the demo question can be binary).
3. The live baseline toggle (fall back to one honest pre-recorded baseline clip).
4. Persona diversity richness (fall back to temperature-only diversity).
5. Deploy to Vercel (demo from localhost).
6. Dropping `SWARM_SIZE` from 50 → 30 to guarantee the live feel.

If badly behind: **binary question, 30 agents, temperature diversity, templated
summary, pre-recorded baseline, localhost.** That still shows a live swarm
converging fast on Cerebras — which is the whole pitch.

---

## 9. The one perfect sample question (design carefully)

Engineer the demo question so the swarm **genuinely disagrees**, making the
convergence visible and the aggregate meaningful:
- Pick something with **real, contested uncertainty** — not a near-certainty
  (don't ask "will the sun rise tomorrow") and not a coin-flip-with-no-signal.
  You want a question where reasonable forecasters land anywhere from ~30% to
  ~80%, so the histogram has a visible **shape** that then **tightens**.
- Binary is safest for the demo (cleaner bins, cleaner animation).
- **Verify in the first hour** that the swarm actually produces a *spread* on
  this question (not all 50 clustered on one value). If it spikes, pick a more
  contested question or widen persona diversity / temperature. Do **not** fake
  the spread.
- Have **one** rock-solid question that always produces a good-looking,
  honest distribution. Optionally a second as backup.

---

## 10. Build order (de-risk fragile things first)

1. **One bare Cerebras call** from a server route: `gemma-4-31b`, strict JSON for
   the Forecaster schema. Confirm parseable JSON comes back reliably; add Zod
   validation + one repair retry. (Hour 1.)
2. **The provider factory:** `makeClient("cerebras" | "baseline")` returning a
   configured OpenAI client. Confirm the **baseline** key/URL/model also returns
   valid JSON with the identical prompt. (This is what makes §6 trivially fair.)
3. **Fan out to 50** via `Promise.allSettled` batching. Confirm dropouts are
   tolerated and the swarm completes. Measure **wall-clock** for the full 50 on
   Cerebras — it must feel live (target: full swarm well under ~3s; if creeping
   up, lower `batchSize` concern, raise it, or drop `SWARM_SIZE`).
4. **Deterministic aggregator** (pure code, unit-test the trim + weighted mean
   on fake data). No model call here.
5. **Stream batches to the client** and render the **ugly** histogram (no
   animation yet) so you can see results landing in waves.
6. **The one beautiful transition** (§7): fan-out dots → fly into bins → snap.
   This is where the polish budget goes.
7. **Synthesizer** call (cuttable — §8).
8. **Real baseline run** last: same swarm via the baseline provider, measure and
   display real latencies; capture an honest pre-recorded run as insurance.

> Confirm strict JSON works for the Moderator, Forecaster, and Synthesizer
> schemas **early**. If structured-output mode is flaky under 50-wide load, the
> defensive parse + drop-on-fail path (§4) must be in place by hour 1, not
> hour 18. Confirm per-call token caps keep the full swarm inside a live budget.

---

## 11. Track framing (this build targets Track 1)

- **Track 1 — Multiverse Agents (PRIMARY for this project):** lead with the
  50-agent swarm as 50 parallel reasoning world-lines, the live emergent
  distribution, the honest aggregation, and the speed that makes a live swarm
  possible. Show the `Cerebras vs Standard GPU API` toggle as proof the swarm is
  only live-able at Cerebras speed.
- This is a **separate submission** from PulseOps (which carries Track 3 and the
  minimal Track 2 push). Do not conflate the two builds.
- Demo video ≤ 60s, must show Cerebras speed, no sensitive info on screen.
  Deadline: **Mon Jun 29, 10:00 AM PT.**

---

## 12. Non-negotiables checklist

- [ ] Reused `.env.local` from PulseOps; keys read via env, never hardcoded
- [ ] `.env*` confirmed in `.gitignore` before any commit (user does git, not Claude Code)
- [ ] `gemma-4-31b` via OpenAI-compatible Cerebras endpoint, confirmed against live docs
- [ ] One `makeClient(provider)` factory drives BOTH Cerebras and the baseline (fair compare)
- [ ] 50-agent fan-out via `Promise.allSettled` batching; dropouts tolerated
- [ ] Results streamed to client per batch; histogram fills in waves
- [ ] Aggregation is deterministic code (confidence-weighted, outlier-trimmed)
- [ ] Spread / confidence label derived from real data, never hardcoded
- [ ] Latency numbers (TTFT, total, agents/sec) real and measured, never hardcoded
- [ ] Baseline is comparable and fair — not a deliberately weak strawman
- [ ] One beautiful fan-out → histogram → snap transition
- [ ] One perfect sample question with genuine, visible disagreement
- [ ] Nothing sensitive visible in the recording
- [ ] Claude Code runs NO git commands — user handles all git personally
