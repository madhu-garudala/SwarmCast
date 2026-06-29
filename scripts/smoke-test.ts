// §10 Step 1 smoke test: one bare Cerebras call → Forecaster schema
// Run: npm run smoke
import OpenAI from "openai";
import { ForecasterSchema, forecasterJsonSchema } from "../lib/schemas";

async function main() {
  const client = new OpenAI({
    apiKey: process.env.CEREBRAS_API_KEY!,
    baseURL: process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1",
  });
  const model = process.env.CEREBRAS_MODEL ?? "gemma-4-31b";

  console.log(`\nSmoke test — provider: Cerebras, model: ${model}`);
  console.log("─────────────────────────────────────────────");

  const t0 = performance.now();

  const response = await client.chat.completions.create({
    model,
    stream: false,
    messages: [
      { role: "system", content: "You are a calibrated forecaster. Respond only in JSON." },
      {
        role: "user",
        content: `Estimate the probability that a privately-built spacecraft carries humans to the Moon before 2030.
Use reasoning_style "base-rate analyst", confidence 0.7. Return JSON only.`,
      },
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
  console.log(`\nRaw response (${elapsed}s):\n${raw}`);

  const validated = ForecasterSchema.safeParse(JSON.parse(raw));
  if (!validated.success) {
    console.error("\n✗ Zod validation FAILED:", validated.error.format());
    process.exit(1);
  }

  const { data } = validated;
  console.log(`\n✓ Parsed successfully:`);
  console.log(`  probability:     ${data.probability}`);
  console.log(`  confidence:      ${data.confidence}`);
  console.log(`  key_factor:      ${data.key_factor}`);
  console.log(`  reasoning_style: ${data.reasoning_style}`);

  const timeInfo = (response as unknown as { time_info?: Record<string, number> }).time_info;
  if (timeInfo) {
    console.log(`\nCerebras time_info:`);
    for (const [k, v] of Object.entries(timeInfo)) {
      console.log(`  ${k}: ${v}`);
    }
    const toks = response.usage?.completion_tokens ?? 0;
    const compTime = timeInfo.completion_time ?? 0;
    if (compTime > 0 && toks > 0) {
      console.log(`  → tokens/sec: ${(toks / compTime).toFixed(0)}`);
    }
  }

  console.log(`\n✓ Step 1 complete — Cerebras call works, JSON parses, Zod validates.`);
}

main().catch(e => { console.error(e); process.exit(1); });
