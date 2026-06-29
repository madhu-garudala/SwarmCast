import { ForecasterOutput } from "./schemas";

export interface AgentResult {
  agentId: number;
  output: ForecasterOutput;
  ttft: number;      // seconds
  totalTime: number; // seconds
  tokens: number;
}

export interface AggregateResult {
  mean: number;            // confidence-weighted, outlier-trimmed mean probability
  median: number;
  stddev: number;
  iqr: number;
  spread: number;          // normalized spread metric 0-1
  confidence_label: "high" | "moderate" | "low";
  bins: number[];          // 10 bins [0-10%,...,90-100%], counts per bin
  valid_count: number;
  trimmed_count: number;   // how many were trimmed as outliers
  dropped_count: number;   // how many failed/were invalid
  // For display
  p10: number;
  p90: number;
}

export interface LatencyStats {
  ttft_ms: number;           // first agent result, ms
  total_ms: number;          // full swarm wall-clock, ms
  agents_per_sec: number;
  avg_tokens_per_sec: number; // per-call throughput
}

// Deterministic aggregation — no model call
export function aggregate(results: AgentResult[], totalAgents: number): AggregateResult {
  // Binary: use probability field
  const valid = results.filter(
    r => r.output.probability !== null &&
         r.output.probability >= 0 &&
         r.output.probability <= 1 &&
         r.output.confidence >= 0 &&
         r.output.confidence <= 1
  );

  const dropped_count = totalAgents - results.length; // agents that threw
  const invalid_count = results.length - valid.length;

  if (valid.length === 0) {
    return {
      mean: 0.5, median: 0.5, stddev: 0, iqr: 0,
      spread: 0, confidence_label: "low",
      bins: new Array(10).fill(0),
      valid_count: 0, trimmed_count: 0, dropped_count: dropped_count + invalid_count,
      p10: 0.5, p90: 0.5,
    };
  }

  // Sort by probability for percentile calcs
  const sorted = [...valid].sort((a, b) => a.output.probability! - b.output.probability!);
  const probs = sorted.map(r => r.output.probability!);

  // Percentile helper
  const pct = (arr: number[], p: number) => {
    const idx = (p / 100) * (arr.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  };

  const p10 = pct(probs, 10);
  const p25 = pct(probs, 25);
  const p50 = pct(probs, 50);
  const p75 = pct(probs, 75);
  const p90 = pct(probs, 90);

  // Trim top/bottom 10%
  const trimLo = Math.floor(valid.length * 0.10);
  const trimHi = valid.length - trimLo;
  const trimmed = sorted.slice(trimLo, trimHi);
  const trimmed_count = valid.length - trimmed.length;

  // Confidence-weighted mean on trimmed set
  const totalWeight = trimmed.reduce((s, r) => s + r.output.confidence, 0);
  const mean = totalWeight > 0
    ? trimmed.reduce((s, r) => s + r.output.probability! * r.output.confidence, 0) / totalWeight
    : trimmed.reduce((s, r) => s + r.output.probability!, 0) / trimmed.length;

  // Std dev on full valid set
  const avg = probs.reduce((s, p) => s + p, 0) / probs.length;
  const variance = probs.reduce((s, p) => s + (p - avg) ** 2, 0) / probs.length;
  const stddev = Math.sqrt(variance);

  const iqr = p75 - p25;

  // Spread metric: normalized stddev (0-1)
  const spread = Math.min(stddev / 0.5, 1);

  const confidence_label: "high" | "moderate" | "low" =
    spread < 0.25 ? "high" : spread < 0.50 ? "moderate" : "low";

  // Bin into 10 buckets [0-10%,...,90-100%]
  const bins = new Array(10).fill(0);
  for (const r of valid) {
    const bin = Math.min(9, Math.floor(r.output.probability! * 10));
    bins[bin]++;
  }

  return {
    mean,
    median: p50,
    stddev,
    iqr,
    spread,
    confidence_label,
    bins,
    valid_count: valid.length,
    trimmed_count,
    dropped_count: dropped_count + invalid_count,
    p10,
    p90,
  };
}

export function computeLatency(
  results: AgentResult[],
  swarmStartMs: number,
  swarmEndMs: number
): LatencyStats {
  if (results.length === 0) {
    return { ttft_ms: 0, total_ms: 0, agents_per_sec: 0, avg_tokens_per_sec: 0 };
  }

  const total_ms = swarmEndMs - swarmStartMs;
  const ttft_ms = results.length > 0 ? Math.min(...results.map(r => r.ttft)) * 1000 : 0;
  const agents_per_sec = results.length / (total_ms / 1000);

  // avg tokens/sec across agents that have timing
  const withTokens = results.filter(r => r.tokens > 0 && r.totalTime > 0);
  const avg_tokens_per_sec = withTokens.length > 0
    ? withTokens.reduce((s, r) => s + r.tokens / r.totalTime, 0) / withTokens.length
    : 0;

  return { ttft_ms, total_ms, agents_per_sec, avg_tokens_per_sec };
}
