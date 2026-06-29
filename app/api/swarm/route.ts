import { NextRequest } from "next/server";
import { makeClient, getModel, Provider } from "@/lib/providers";
import { PERSONAS } from "@/lib/personas";
import { runModerator, runForecaster, runSynthesizer } from "@/lib/swarm";
import { AgentResult, aggregate, computeLatency } from "@/lib/aggregator";

export const runtime = "nodejs";
export const maxDuration = 120;

const SWARM_SIZE = 50;
const BATCH_SIZE = 10;

function sseEvent(type: string, data: unknown): string {
  return `data: ${JSON.stringify({ type, ...( typeof data === "object" ? data : { payload: data }) })}\n\n`;
}

export async function POST(req: NextRequest) {
  const { question, provider: providerParam } = await req.json() as { question: string; provider: string };
  const provider = (providerParam === "baseline" ? "baseline" : "cerebras") as Provider;

  const client = makeClient(provider);
  const model = getModel(provider);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(type, data)));
        } catch {
          // client disconnected
        }
      };

      try {
        // ── Moderator ──────────────────────────────────────────────────────
        send("status", { message: "Moderating question…" });
        const context = await runModerator(client, model, question);
        if (!context) {
          send("error", { message: "Failed to parse question. Please rephrase." });
          controller.close();
          return;
        }
        send("context", { context });

        // ── Fan-out swarm ──────────────────────────────────────────────────
        send("status", { message: `Deploying ${SWARM_SIZE} agents…` });
        const personas = PERSONAS.slice(0, SWARM_SIZE);
        const allResults: AgentResult[] = [];
        let firstResultAt: number | null = null;
        const swarmStart = performance.now();

        for (let i = 0; i < personas.length; i += BATCH_SIZE) {
          const batch = personas.slice(i, i + BATCH_SIZE);
          const batchStart = performance.now();

          const settled = await Promise.allSettled(
            batch.map(persona => runForecaster(client, model, persona, context, question))
          );

          const batchResults: AgentResult[] = [];
          for (let j = 0; j < settled.length; j++) {
            const r = settled[j];
            if (r.status === "fulfilled" && r.value !== null) {
              const result = r.value;
              if (firstResultAt === null) {
                firstResultAt = performance.now() - swarmStart;
              }
              allResults.push(result);
              batchResults.push(result);
            }
          }

          const batchEnd = performance.now();
          send("batch", {
            batchIndex: Math.floor(i / BATCH_SIZE),
            batchMs: batchEnd - batchStart,
            results: batchResults,
          });
        }

        const swarmEnd = performance.now();

        // ── Aggregate ──────────────────────────────────────────────────────
        const agg = aggregate(allResults, SWARM_SIZE);
        const latency = computeLatency(
          allResults,
          swarmStart + performance.timeOrigin,
          swarmEnd + performance.timeOrigin,
        );
        latency.ttft_ms = firstResultAt ? firstResultAt : latency.ttft_ms;
        latency.total_ms = swarmEnd - swarmStart;

        send("aggregate", { aggregate: agg, latency });

        // ── Synthesizer ────────────────────────────────────────────────────
        // Cuttable per §8 — wired but easy to disable
        const sampleRationales = allResults
          .slice(0, 6)
          .map(r => `[${r.output.reasoning_style}] ${r.output.key_factor}`);

        const synthesis = await runSynthesizer(
          client, model, question,
          agg.mean, agg.spread, agg.confidence_label,
          sampleRationales,
        );
        send("synthesis", { synthesis });

        send("done", { message: "Swarm complete" });
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Unexpected error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
