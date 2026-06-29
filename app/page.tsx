"use client";

import { useState, useRef, useCallback } from "react";
import SwarmViz from "@/components/SwarmViz";
import ForecastCard from "@/components/ForecastCard";
import LatencyBar from "@/components/LatencyBar";
import AgentDetailPanel from "@/components/AgentDetailPanel";
import { AgentResult, AggregateResult } from "@/lib/aggregator";
import { SynthesizerOutput } from "@/lib/schemas";

type Phase = "idle" | "thinking" | "filling" | "done";
type Provider = "cerebras" | "baseline";

const SAMPLE_QUESTIONS = [
  "Will a privately-built spacecraft carry humans to the Moon before 2030?",
  "Will global EV sales exceed 40% of new car sales in 2027?",
  "Will OpenAI remain the leading AI lab by revenue in 2027?",
];

const SWARM_SIZE = 50;

interface LatencyStats {
  ttft_ms: number;
  total_ms: number;
  agents_per_sec: number;
  avg_tokens_per_sec: number;
}

export default function Home() {
  const [question, setQuestion] = useState(SAMPLE_QUESTIONS[0]);
  const [provider, setProvider] = useState<Provider>("cerebras");
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [results, setResults] = useState<AgentResult[]>([]);
  const [aggregate, setAggregate] = useState<AggregateResult | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesizerOutput | null>(null);
  const [latencyMap, setLatencyMap] = useState<Partial<Record<Provider, LatencyStats>>>({});
  const [selectedAgent, setSelectedAgent] = useState<AgentResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const allResultsRef = useRef<AgentResult[]>([]);

  const runSwarm = useCallback(async () => {
    if (phase === "thinking" || phase === "filling") {
      abortRef.current?.abort();
      setPhase("idle");
      return;
    }

    // Reset
    setResults([]);
    setAggregate(null);
    setSynthesis(null);
    setStatusMsg("");
    setSelectedAgent(null);
    allResultsRef.current = [];
    setPhase("thinking");

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, provider }),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        setStatusMsg("API error — check server logs");
        setPhase("idle");
        return;
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
            const evt = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
            handleEvent(evt);
          } catch {
            // malformed SSE line
          }
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setStatusMsg(e instanceof Error ? e.message : "Unknown error");
      }
      setPhase("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, provider, phase]);

  function handleEvent(evt: Record<string, unknown>) {
    switch (evt.type) {
      case "status":
        setStatusMsg(evt.message as string);
        break;

      case "context":
        setPhase("filling");
        break;

      case "batch": {
        const batchResults = evt.results as AgentResult[];
        allResultsRef.current = [...allResultsRef.current, ...batchResults];
        setResults([...allResultsRef.current]);
        break;
      }

      case "aggregate": {
        const agg = evt.aggregate as AggregateResult;
        const lat = evt.latency as LatencyStats;
        setAggregate(agg);
        setLatencyMap(prev => ({ ...prev, [provider]: lat }));
        break;
      }

      case "synthesis":
        setSynthesis(evt.synthesis as SynthesizerOutput | null);
        setPhase("done");
        setStatusMsg("Swarm complete");
        break;

      case "done":
        setPhase("done");
        setStatusMsg("Swarm complete");
        break;

      case "error":
        setStatusMsg(`Error: ${evt.message}`);
        setPhase("idle");
        break;
    }
  }

  const isRunning = phase === "thinking" || phase === "filling";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">SwarmCast</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            50-agent wisdom-of-crowds forecasting · Cerebras × Gemma 4
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs">Provider:</span>
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-sm">
            <button
              onClick={() => setProvider("cerebras")}
              className={`px-3 py-1.5 font-medium transition-colors ${
                provider === "cerebras"
                  ? "bg-orange-500 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              Cerebras
            </button>
            <button
              onClick={() => setProvider("baseline")}
              className={`px-3 py-1.5 font-medium transition-colors ${
                provider === "baseline"
                  ? "bg-slate-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              Standard GPU API
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6 max-w-7xl mx-auto w-full">
        {/* Left: input + viz + latency */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Question input */}
          <div className="space-y-2">
            <label className="text-slate-400 text-xs uppercase tracking-wider">Forecast question</label>
            <div className="flex gap-2">
              <input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !isRunning && runSwarm()}
                placeholder="Ask a forecastable question…"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-600 text-sm"
              />
              <button
                onClick={runSwarm}
                disabled={!question.trim()}
                className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  isRunning
                    ? "bg-red-900/60 text-red-400 border border-red-800 hover:bg-red-900"
                    : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {isRunning ? "Stop" : "Run Swarm →"}
              </button>
            </div>

            {/* Sample questions */}
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setQuestion(q)}
                  className="text-xs text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-600 rounded px-2 py-1 transition-colors"
                >
                  {q.length > 50 ? q.slice(0, 47) + "…" : q}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          {statusMsg && (
            <div className="text-slate-400 text-xs px-1 flex items-center gap-2">
              {isRunning && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              )}
              {statusMsg}
              {results.length > 0 && (
                <span className="text-slate-600">· {results.length}/{SWARM_SIZE} agents</span>
              )}
            </div>
          )}

          {/* Hero visualization */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
            <SwarmViz
              swarmSize={SWARM_SIZE}
              phase={phase}
              results={results}
              selectedAgentId={selectedAgent?.agentId ?? null}
              onDotClick={r => setSelectedAgent(prev => prev?.agentId === r.agentId ? null : r)}
              aggregate={
                aggregate
                  ? {
                      mean: aggregate.mean,
                      p10: aggregate.p10,
                      p90: aggregate.p90,
                      bins: aggregate.bins,
                      confidence_label: aggregate.confidence_label,
                    }
                  : null
              }
            />
          </div>

          {/* Latency bar */}
          <LatencyBar
            cerebras={latencyMap.cerebras ?? null}
            baseline={latencyMap.baseline ?? null}
            activeProvider={provider}
          />
        </div>

        {/* Right: forecast card + info */}
        <div className="lg:w-72 xl:w-80 flex flex-col gap-4">
          <ForecastCard
            aggregate={aggregate}
            synthesis={synthesis}
            question={question}
            visible={phase === "done" || (phase === "filling" && aggregate !== null)}
          />

          {/* Idle state instructions */}
          {phase === "idle" && !aggregate && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3 text-sm text-slate-400">
              <p className="font-medium text-slate-300">How it works</p>
              <ol className="space-y-2 list-decimal list-inside text-xs leading-relaxed">
                <li>Ask a binary forecastable question</li>
                <li>50 agents with diverse reasoning styles independently estimate a probability</li>
                <li>Watch the distribution form live as batches of 10 return</li>
                <li>A calibrated aggregate snaps in — more accurate than any single agent</li>
                <li>Toggle to Standard GPU API to see why Cerebras speed matters</li>
              </ol>
              <div className="border-t border-slate-800 pt-3">
                <p className="text-xs text-slate-500">
                  All 50 agents run concurrently in batches of 10.
                  Only possible in real-time on Cerebras.
                </p>
              </div>
            </div>
          )}

          {/* Live agent progress */}
          {isRunning && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-xs">Agents returned</span>
                <span className="text-white font-bold tabular-nums">
                  {results.length} / {SWARM_SIZE}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(results.length / SWARM_SIZE) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Agent detail panel — shown when a dot is clicked */}
          {selectedAgent && (
            <AgentDetailPanel
              result={selectedAgent}
              onClose={() => setSelectedAgent(null)}
            />
          )}

          {/* Sample Agent Rationales — shown when no dot is selected */}
          {phase === "done" && results.length > 0 && !selectedAgent && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
              <p className="text-slate-400 text-xs uppercase tracking-wider">
                Sample Rationales{" "}
                <span className="normal-case text-slate-600 font-normal">— click any dot to inspect</span>
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {results.slice(0, 8).map(r => (
                  <div
                    key={r.agentId}
                    className="text-xs cursor-pointer hover:bg-slate-800/50 rounded px-1 py-0.5 -mx-1 transition-colors"
                    onClick={() => setSelectedAgent(r)}
                  >
                    <span className="text-slate-500">[{r.output.reasoning_style}]</span>{" "}
                    <span className="text-slate-300">{r.output.key_factor}</span>{" "}
                    <span className="text-blue-400 font-medium tabular-nums">
                      {r.output.probability !== null
                        ? `${(r.output.probability * 100).toFixed(0)}%`
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
