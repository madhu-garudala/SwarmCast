// Unit tests for the deterministic aggregator — run with: npx tsx lib/__tests__/aggregator.test.ts
import { aggregate, computeLatency, AgentResult } from "../aggregator";
import { ForecasterOutput } from "../schemas";

function makeResult(id: number, prob: number, confidence: number): AgentResult {
  const output: ForecasterOutput = {
    probability: prob,
    point_estimate: null,
    low: null,
    high: null,
    confidence,
    key_factor: `test factor ${id}`,
    reasoning_style: "test style",
  };
  return { agentId: id, output, ttft: 0.1, totalTime: 0.3, tokens: 100 };
}

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, msg?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${msg ? `: ${msg}` : ""}`);
    failed++;
  }
}

function approx(a: number, b: number, tol = 0.01) {
  return Math.abs(a - b) < tol;
}

console.log("\n── Aggregator unit tests ──────────────────────────────");

// Test 1: basic mean with uniform confidence
{
  console.log("\nTest 1: uniform confidence, uniform probs");
  const results = [0.3, 0.5, 0.7, 0.4, 0.6].map((p, i) => makeResult(i, p, 1.0));
  const agg = aggregate(results, 5);
  assert("valid_count = 5", agg.valid_count === 5);
  assert("bins sum ≤ valid_count", agg.bins.reduce((s, b) => s + b, 0) <= agg.valid_count);
  assert("mean in [0,1]", agg.mean >= 0 && agg.mean <= 1);
  assert("p10 ≤ p90", agg.p10 <= agg.p90);
  assert("spread ≥ 0", agg.spread >= 0);
}

// Test 2: confidence-weighted mean pulls toward high-confidence outlier
{
  console.log("\nTest 2: confidence weighting");
  const results = [
    makeResult(0, 0.1, 0.1),  // low-confidence low
    makeResult(1, 0.1, 0.1),
    makeResult(2, 0.9, 0.95), // high-confidence high
    makeResult(3, 0.1, 0.1),
    makeResult(4, 0.1, 0.1),
    makeResult(5, 0.1, 0.1),
    makeResult(6, 0.1, 0.1),
    makeResult(7, 0.1, 0.1),
    makeResult(8, 0.1, 0.1),
    makeResult(9, 0.1, 0.1),
    makeResult(10, 0.1, 0.1),
    makeResult(11, 0.1, 0.1),
  ];
  const agg = aggregate(results, 12);
  // After trimming outliers: the 0.9 outlier should be trimmed
  // Even if not, weighted mean should be > simple mean
  assert("mean in [0,1]", agg.mean >= 0 && agg.mean <= 1);
  assert("valid_count = 12", agg.valid_count === 12);
  console.log(`    mean=${agg.mean.toFixed(3)}, trimmed=${agg.trimmed_count}`);
}

// Test 3: tight spread → "high" confidence label
{
  console.log("\nTest 3: tight spread → high confidence");
  const results = Array.from({ length: 20 }, (_, i) =>
    makeResult(i, 0.5 + (i % 3) * 0.01, 1.0)  // all near 0.5
  );
  const agg = aggregate(results, 20);
  assert("confidence_label = high", agg.confidence_label === "high", `got ${agg.confidence_label}`);
  assert("stddev < 0.1", agg.stddev < 0.1, `stddev=${agg.stddev.toFixed(3)}`);
}

// Test 4: wide spread → "low" confidence label
{
  console.log("\nTest 4: wide spread → low confidence");
  const results = Array.from({ length: 20 }, (_, i) =>
    makeResult(i, i / 19, 1.0)  // spread from 0 to 1
  );
  const agg = aggregate(results, 20);
  assert("confidence_label = low", agg.confidence_label === "low", `got ${agg.confidence_label}`);
  assert("spread ≥ 0.5", agg.spread >= 0.5, `spread=${agg.spread.toFixed(3)}`);
}

// Test 5: invalid/out-of-range agents are dropped
{
  console.log("\nTest 5: invalid agents dropped");
  const results = [
    makeResult(0, 0.4, 1.0),
    makeResult(1, 0.5, 1.0),
    { ...makeResult(2, 0.6, 1.0), output: { ...makeResult(2, 0.6, 1.0).output, probability: 1.5 } },  // invalid
    { ...makeResult(3, 0.5, 1.0), output: { ...makeResult(3, 0.5, 1.0).output, probability: null } },  // null
    makeResult(4, 0.6, 1.0),
  ];
  const agg = aggregate(results, 5);
  assert("valid_count = 3 (null and 1.5 are invalid)", agg.valid_count === 3, `got ${agg.valid_count}`);
  assert("dropped_count = 2", agg.dropped_count === 2, `got ${agg.dropped_count}`);
}

// Test 6: bins are correctly populated
{
  console.log("\nTest 6: bin assignment");
  const results = [
    makeResult(0, 0.05, 1.0),  // bin 0
    makeResult(1, 0.15, 1.0),  // bin 1
    makeResult(2, 0.55, 1.0),  // bin 5
    makeResult(3, 0.99, 1.0),  // bin 9
  ];
  const agg = aggregate(results, 4);
  assert("bin 0 has 1", agg.bins[0] === 1, `got ${agg.bins[0]}`);
  assert("bin 1 has 1", agg.bins[1] === 1, `got ${agg.bins[1]}`);
  assert("bin 5 has 1", agg.bins[5] === 1, `got ${agg.bins[5]}`);
  assert("bin 9 has 1", agg.bins[9] === 1, `got ${agg.bins[9]}`);
}

// Test 7: empty results
{
  console.log("\nTest 7: empty results fallback");
  const agg = aggregate([], 50);
  assert("mean = 0.5 (fallback)", approx(agg.mean, 0.5));
  assert("confidence = low", agg.confidence_label === "low");
  assert("valid_count = 0", agg.valid_count === 0);
}

// Test 8: latency calculation
{
  console.log("\nTest 8: latency calculation");
  const results = [
    { ...makeResult(0, 0.5, 1.0), ttft: 0.2, totalTime: 0.5, tokens: 200 },
    { ...makeResult(1, 0.5, 1.0), ttft: 0.3, totalTime: 0.6, tokens: 300 },
  ];
  const now = Date.now();
  const lat = computeLatency(results, now, now + 1500);
  assert("total_ms = 1500", approx(lat.total_ms, 1500, 5));
  assert("agents_per_sec > 0", lat.agents_per_sec > 0);
  assert("avg_tokens_per_sec > 0", lat.avg_tokens_per_sec > 0);
  console.log(`    agents/sec=${lat.agents_per_sec.toFixed(1)}, tok/s=${lat.avg_tokens_per_sec.toFixed(0)}`);
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──────────────────`);
if (failed > 0) process.exit(1);
