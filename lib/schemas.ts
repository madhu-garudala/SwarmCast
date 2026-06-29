import { z } from "zod";

// ── Moderator ────────────────────────────────────────────────────────────────
export const ModeratorSchema = z.object({
  question_type: z.enum(["binary", "numeric"]),
  resolution_criteria: z.string(),
  unit: z.string().nullable(),
  lower_bound: z.number(),
  upper_bound: z.number(),
  horizon: z.string(),
});
export type ModeratorOutput = z.infer<typeof ModeratorSchema>;

export const moderatorJsonSchema = {
  type: "object" as const,
  properties: {
    question_type: { type: "string", enum: ["binary", "numeric"] },
    resolution_criteria: { type: "string" },
    unit: { type: ["string", "null"] },
    lower_bound: { type: "number" },
    upper_bound: { type: "number" },
    horizon: { type: "string" },
  },
  required: ["question_type", "resolution_criteria", "unit", "lower_bound", "upper_bound", "horizon"],
  additionalProperties: false,
};

// ── Forecaster ───────────────────────────────────────────────────────────────
export const ForecasterSchema = z.object({
  probability: z.number().min(0).max(1).nullable(),
  point_estimate: z.number().nullable(),
  low: z.number().nullable(),
  high: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  key_factor: z.string(),
  reasoning_style: z.string(),
});
export type ForecasterOutput = z.infer<typeof ForecasterSchema>;

export const forecasterJsonSchema = {
  type: "object" as const,
  properties: {
    probability: { type: ["number", "null"] },
    point_estimate: { type: ["number", "null"] },
    low: { type: ["number", "null"] },
    high: { type: ["number", "null"] },
    confidence: { type: "number" },
    key_factor: { type: "string" },
    reasoning_style: { type: "string" },
  },
  required: ["probability", "point_estimate", "low", "high", "confidence", "key_factor", "reasoning_style"],
  additionalProperties: false,
};

// ── Synthesizer ───────────────────────────────────────────────────────────────
export const SynthesizerSchema = z.object({
  headline_forecast: z.string(),
  consensus_summary: z.string(),
  main_disagreement: z.string(),
  confidence_label: z.enum(["high", "moderate", "low"]),
});
export type SynthesizerOutput = z.infer<typeof SynthesizerSchema>;

export const synthesizerJsonSchema = {
  type: "object" as const,
  properties: {
    headline_forecast: { type: "string" },
    consensus_summary: { type: "string" },
    main_disagreement: { type: "string" },
    confidence_label: { type: "string", enum: ["high", "moderate", "low"] },
  },
  required: ["headline_forecast", "consensus_summary", "main_disagreement", "confidence_label"],
  additionalProperties: false,
};
