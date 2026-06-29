// §10 Step 3: full 50-agent swarm bench — streams SSE from local dev server
// Run: npx tsx --env-file=.env.local scripts/swarm-bench.ts
async function main() {
  const QUESTION = "Will a privately-built spacecraft carry humans to the Moon before 2030?";
  const PROVIDER = "cerebras";
  const URL = "http://localhost:3001/api/swarm";

  console.log(`\nSwarm bench — question: "${QUESTION}"`);
  console.log(`Provider: ${PROVIDER}`);
  console.log("────────────────────────────────────────────────────────");

  const t0 = performance.now();
  let firstResultMs: number | null = null;
  let agentCount = 0;
  let batchCount = 0;

  const response = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: QUESTION, provider: PROVIDER }),
  });

  if (!response.ok || !response.body) {
    console.error("HTTP error:", response.status);
    process.exit(1);
  }

  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";

    for (const block of blocks) {
      const dataLine = block.split("\n").find(l => l.startsWith("data: "));
      if (!dataLine) continue;
      try {
        const evt = JSON.parse(dataLine.slice(6));
        const now = performance.now() - t0;

        switch (evt.type) {
          case "status":
            console.log(`  [${now.toFixed(0)}ms] status: ${evt.message}`);
            break;
          case "context":
            console.log(`  [${now.toFixed(0)}ms] moderator done: type=${evt.context?.question_type}`);
            break;
          case "batch": {
            batchCount++;
            const count = (evt.results ?? []).length;
            agentCount += count;
            if (firstResultMs === null && count > 0) firstResultMs = now;
            console.log(`  [${now.toFixed(0)}ms] batch ${batchCount}: +${count} agents (total: ${agentCount})`);
            break;
          }
          case "aggregate": {
            const agg = evt.aggregate;
            const lat = evt.latency;
            console.log(`\n  AGGREGATE:`);
            console.log(`    mean: ${(agg.mean * 100).toFixed(1)}%`);
            console.log(`    confidence: ${agg.confidence_label}`);
            console.log(`    valid agents: ${agg.valid_count}`);
            console.log(`    stddev: ${(agg.stddev * 100).toFixed(1)}%`);
            console.log(`    bins: [${agg.bins.join(", ")}]`);
            console.log(`\n  LATENCY (measured):`);
            console.log(`    TTFT:           ${lat.ttft_ms.toFixed(0)}ms`);
            console.log(`    Total swarm:    ${lat.total_ms.toFixed(0)}ms`);
            console.log(`    Agents/sec:     ${lat.agents_per_sec.toFixed(1)}`);
            console.log(`    Avg tok/sec:    ${lat.avg_tokens_per_sec.toFixed(0)}`);
            break;
          }
          case "synthesis":
            if (evt.synthesis) {
              console.log(`\n  SYNTHESIS: "${evt.synthesis.headline_forecast}"`);
              console.log(`    ${evt.synthesis.consensus_summary}`);
            }
            break;
          case "done":
            console.log(`\n  [${now.toFixed(0)}ms] done`);
            break;
          case "error":
            console.error(`\n  ERROR: ${evt.message}`);
            break;
        }
      } catch {
        // skip
      }
    }
  }

  const totalMs = performance.now() - t0;
  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`Wall-clock (client side): ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`TTFT (client side):       ${firstResultMs !== null ? firstResultMs.toFixed(0) + "ms" : "n/a"}`);
  console.log(`Agents completed:         ${agentCount}/50`);
}

main().catch(e => { console.error(e); process.exit(1); });
