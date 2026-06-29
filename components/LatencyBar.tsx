"use client";

interface LatencyStats {
  ttft_ms: number;
  total_ms: number;
  agents_per_sec: number;
  avg_tokens_per_sec: number;
}

interface Props {
  cerebras: LatencyStats | null;
  baseline: LatencyStats | null;
  activeProvider: "cerebras" | "baseline";
}

function Metric({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 text-center ${highlight ? "bg-blue-950/50 border border-blue-800/60" : "bg-slate-800/60"}`}>
      <div className={`text-lg font-bold tabular-nums ${highlight ? "text-blue-300" : "text-white"}`}>
        {value}
        <span className={`text-xs font-normal ml-1 ${highlight ? "text-blue-400" : "text-slate-400"}`}>{unit}</span>
      </div>
      <div className="text-slate-500 text-[11px] mt-0.5">{label}</div>
    </div>
  );
}

export default function LatencyBar({ cerebras, baseline, activeProvider }: Props) {
  const stats = activeProvider === "cerebras" ? cerebras : baseline;

  if (!stats) {
    return (
      <div className="border-t border-slate-800 pt-4 mt-4">
        <div className="text-slate-600 text-xs text-center">Latency metrics will appear here after the swarm runs</div>
      </div>
    );
  }

  const showComparison = cerebras && baseline;

  return (
    <div className="border-t border-slate-800 pt-4 mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-slate-500 text-xs uppercase tracking-wider">Live Latency Metrics</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          activeProvider === "cerebras"
            ? "bg-orange-950/60 text-orange-400 border border-orange-800"
            : "bg-slate-800 text-slate-400 border border-slate-700"
        }`}>
          {activeProvider === "cerebras" ? "Cerebras Inference" : "Standard GPU API"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric
          label="Time to First Result"
          value={stats.ttft_ms < 1000 ? stats.ttft_ms.toFixed(0) : (stats.ttft_ms / 1000).toFixed(2)}
          unit={stats.ttft_ms < 1000 ? "ms" : "s"}
          highlight={activeProvider === "cerebras"}
        />
        <Metric
          label="Full Swarm (50 agents)"
          value={stats.total_ms < 1000 ? stats.total_ms.toFixed(0) : (stats.total_ms / 1000).toFixed(2)}
          unit={stats.total_ms < 1000 ? "ms" : "s"}
          highlight={activeProvider === "cerebras"}
        />
        <Metric
          label="Agents per Second"
          value={stats.agents_per_sec.toFixed(1)}
          unit="agents/s"
          highlight={activeProvider === "cerebras"}
        />
        <Metric
          label="Avg Tokens/sec"
          value={stats.avg_tokens_per_sec > 0 ? stats.avg_tokens_per_sec.toFixed(0) : "—"}
          unit="tok/s"
          highlight={activeProvider === "cerebras"}
        />
      </div>

      {/* Side-by-side comparison when both have run */}
      {showComparison && (
        <div className="mt-2 rounded-lg border border-slate-700 p-3 bg-slate-900/50">
          <div className="text-slate-400 text-xs mb-2 font-medium">Speed comparison (same swarm, same prompt)</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-orange-400 font-semibold text-xs mb-1">Cerebras</div>
              <div className="text-white">{(cerebras.total_ms / 1000).toFixed(2)}s total</div>
              <div className="text-slate-400 text-xs">{cerebras.agents_per_sec.toFixed(1)} agents/s</div>
            </div>
            <div>
              <div className="text-slate-400 font-semibold text-xs mb-1">Standard GPU API</div>
              <div className="text-white">{(baseline.total_ms / 1000).toFixed(2)}s total</div>
              <div className="text-slate-400 text-xs">{baseline.agents_per_sec.toFixed(1)} agents/s</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-blue-400">
            Cerebras is {(baseline.total_ms / cerebras.total_ms).toFixed(1)}× faster for this swarm
          </div>
        </div>
      )}
    </div>
  );
}
