import OpenAI from "openai";
import { z } from "zod";
import {
  ForecasterSchema, ForecasterOutput,
  ModeratorSchema, ModeratorOutput,
  SynthesizerSchema, SynthesizerOutput,
  forecasterJsonSchema, moderatorJsonSchema, synthesizerJsonSchema,
} from "./schemas";
import { Persona } from "./personas";
import { AgentResult } from "./aggregator";

const SYSTEM_PROMPT_FORECASTER = (persona: Persona, context: ModeratorOutput, question: string) => `
You are Agent-${persona.id}, an independent forecaster with this profile:
- Reasoning style: ${persona.style}
- Risk posture: ${persona.risk}
- Time-horizon weighting: ${persona.horizon}

The question: "${question}"
Resolution criteria: ${context.resolution_criteria}
Time horizon: ${context.horizon}

Your job: reason briefly from your assigned perspective, then produce a probability estimate.
Keep your reasoning internal — output ONLY the JSON with your estimate and a one-line key factor.
For binary questions, set probability to a number 0-1. Set point_estimate, low, high to null.
`.trim();

const SYSTEM_PROMPT_MODERATOR = `
You are a question moderator. Normalize the user's question into a structured forecast specification.
For binary questions: lower_bound=0, upper_bound=1, unit=null.
For numeric questions: specify the unit, realistic lower/upper bounds, and horizon.
`.trim();

// One repair retry around structured output parse
async function callWithRetry<T>(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
  jsonSchema: Record<string, unknown>,
  schemaName: string,
  temperature = 0.9,
): Promise<{ result: T; ttft: number; totalTime: number; tokens: number } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const t0 = performance.now();
      const response = await client.chat.completions.create({
        model,
        stream: false,
        messages: [
          { role: "system", content: attempt === 0 ? systemPrompt : "Return ONLY valid JSON matching the schema. No prose." },
          { role: "user", content: attempt === 0 ? userPrompt : `${userPrompt}\n\nReturn only valid JSON.` },
        ],
        temperature: attempt === 0 ? temperature : 0.1,
        max_completion_tokens: 512,
        top_p: 1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema: jsonSchema,
          },
        },
      });
      const t1 = performance.now();

      const raw = response.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw);
      const validated = schema.safeParse(parsed);
      if (!validated.success) continue; // retry

      const timeInfo = (response as unknown as { time_info?: { prompt_time?: number; total_time?: number } }).time_info;
      const ttft = timeInfo?.prompt_time ?? (t1 - t0) / 1000;
      const totalTime = timeInfo?.total_time ?? (t1 - t0) / 1000;
      const tokens = response.usage?.completion_tokens ?? 0;

      return { result: validated.data, ttft, totalTime, tokens };
    } catch {
      // continue to retry or return null
    }
  }
  return null;
}

export async function runModerator(
  client: OpenAI,
  model: string,
  question: string
): Promise<ModeratorOutput | null> {
  const res = await callWithRetry(
    client, model,
    SYSTEM_PROMPT_MODERATOR,
    `Normalize this question for forecasting: "${question}"`,
    ModeratorSchema,
    moderatorJsonSchema,
    "moderator_output",
    0.3,
  );
  return res?.result ?? null;
}

export async function runForecaster(
  client: OpenAI,
  model: string,
  persona: Persona,
  context: ModeratorOutput,
  question: string,
): Promise<AgentResult | null> {
  const sysPrompt = SYSTEM_PROMPT_FORECASTER(persona, context, question);
  const userPrompt = `Question: "${question}"\n\nProvide your probability estimate as Agent-${persona.id} (${persona.style}).`;

  const res = await callWithRetry(
    client, model,
    sysPrompt,
    userPrompt,
    ForecasterSchema,
    forecasterJsonSchema,
    "forecaster_output",
    persona.temperature,
  );
  if (!res) return null;

  return {
    agentId: persona.id,
    output: res.result,
    ttft: res.ttft,
    totalTime: res.totalTime,
    tokens: res.tokens,
  };
}

export async function runSynthesizer(
  client: OpenAI,
  model: string,
  question: string,
  mean: number,
  spread: number,
  confidence_label: string,
  sampleRationales: string[],
): Promise<SynthesizerOutput | null> {
  const sysPrompt = `You are a calibrated forecast synthesizer. Given an aggregate prediction and sample agent rationales, write a concise human summary.`;
  const userPrompt = `
Question: "${question}"
Aggregate probability: ${(mean * 100).toFixed(1)}%
Spread / disagreement: ${confidence_label} (stddev ≈ ${(spread * 50).toFixed(1)}%)
Sample agent rationales:
${sampleRationales.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Produce a 2-3 sentence summary naming the consensus AND the main source of disagreement.
`.trim();

  const res = await callWithRetry(
    client, model,
    sysPrompt,
    userPrompt,
    SynthesizerSchema,
    synthesizerJsonSchema,
    "synthesizer_output",
    0.4,
  );
  return res?.result ?? null;
}
