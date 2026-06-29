// §10 Step 2 smoke test: baseline provider (identical call, different config)
// Run: npm run smoke:both
import { makeClient, getModel } from "../lib/providers";
import { ForecasterSchema, forecasterJsonSchema } from "../lib/schemas";

async function main() {
  for (const provider of ["cerebras", "baseline"] as const) {
    const client = makeClient(provider);
    const model = getModel(provider);

    console.log(`\n[${provider}] model: ${model}`);
    const t0 = performance.now();

    try {
      const response = await client.chat.completions.create({
        model,
        stream: false,
        messages: [
          { role: "system", content: "You are a calibrated forecaster. Respond only in JSON." },
          { role: "user", content: `Estimate probability that global EV sales exceed 40% of new car sales in 2027. Reasoning style: "trend extrapolator". Return JSON only.` },
        ],
        temperature: 0.9,
        max_completion_tokens: 512,
        top_p: 1,
        response_format: {
          type: "json_schema",
          json_schema: { name: "forecaster_output", strict: true, schema: forecasterJsonSchema },
        },
      });

      const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
      const raw = response.choices[0]?.message?.content ?? "";
      const validated = ForecasterSchema.safeParse(JSON.parse(raw));

      if (!validated.success) {
        console.error(`  ✗ [${provider}] Zod validation FAILED:`, validated.error.format());
        continue;
      }

      const timeInfo = (response as unknown as { time_info?: Record<string, number> }).time_info;
      const tps = timeInfo?.completion_time && response.usage?.completion_tokens
        ? ` (${(response.usage.completion_tokens / timeInfo.completion_time).toFixed(0)} tok/s)`
        : "";

      console.log(`  ✓ [${provider}] ${elapsed}s${tps} — prob=${validated.data.probability}, conf=${validated.data.confidence}`);
    } catch (e) {
      console.error(`  ✗ [${provider}] API error:`, e instanceof Error ? e.message : e);
    }
  }

  console.log("\n✓ Step 2 complete — both providers checked.");
}

main().catch(e => { console.error(e); process.exit(1); });
