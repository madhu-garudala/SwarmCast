import OpenAI from "openai";

export type Provider = "cerebras" | "baseline";

export function makeClient(provider: Provider): OpenAI {
  if (provider === "cerebras") {
    return new OpenAI({
      apiKey: process.env.CEREBRAS_API_KEY!,
      baseURL: process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1",
    });
  }
  return new OpenAI({
    apiKey: process.env.BASELINE_API_KEY!,
    baseURL: process.env.BASELINE_BASE_URL ?? "https://api.openai.com/v1",
  });
}

export function getModel(provider: Provider): string {
  if (provider === "cerebras") {
    return process.env.CEREBRAS_MODEL ?? "gemma-4-31b";
  }
  return process.env.BASELINE_MODEL ?? "gpt-4o-mini";
}
