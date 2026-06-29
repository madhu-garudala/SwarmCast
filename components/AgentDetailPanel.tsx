"use client";

import { AgentResult } from "@/lib/aggregator";
import { PERSONAS } from "@/lib/personas";

interface Props {
  result: AgentResult;
  onClose: () => void;
}

const RISK_COLORS: Record<string, string> = {
  cautious:   "text-sky-400 bg-sky-950/50 border-sky-800",
  moderate:   "text-amber-400 bg-amber-950/50 border-amber-800",
  aggressive: "text-rose-400 bg-rose-950/50 border-rose-800",
};

const HORIZON_COLORS: Record<string, string> = {
  "near-term": "text-emerald-400 bg-emerald-950/50 border-emerald-800",
  "mid-term":  "text-violet-400 bg-violet-950/50 border-violet-800",
  "long-term": "text-orange-400 bg-orange-950/50 border-orange-800",
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${className}`}>
      {label}
    </span>
  );
}

export default function AgentDetailPanel({ result, onClose }: Props) {
  const persona = PERSONAS[result.agentId] ?? null;
  const prob = result.output.probability ?? 0;
  const conf = result.output.confidence;

  // Bin color to match the dot in the histogram
  const binIndex = Math.min(9, Math.floor(prob * 10));
  const dotColor = `hsl(${200 + binIndex * 14}, 65%, 58%)`;

  return (
    <div
      className="rounded-xl border border-slate-700 bg-slate-900/90 p-5 space-y-4"
      style={{ animation: "snap-in 0.3s cubic-bezier(.34,1.56,.64,1) both" }}
    >
      <style>{`
        @keyframes snap-in {
          from { opacity: 0; transform: scale(0.94) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5"
            style={{
              background: dotColor,
              boxShadow: `0 0 0 2px #0f172a, 0 0 0 4px ${dotColor}55`,
            }}
          />
          <div>
            <div className="text-white font-semibold text-sm">
              Agent #{result.agentId}
            </div>
            <div className="text-slate-400 text-xs mt-0.5">
              {result.output.reasoning_style}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-600 hover:text-slate-300 text-lg leading-none transition-colors flex-shrink-0 mt-0.5"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Persona badges */}
      {persona && (
        <div className="flex flex-wrap gap-1.5">
          <Badge
            label={persona.risk + " risk"}
            className={RISK_COLORS[persona.risk] ?? RISK_COLORS.moderate}
          />
          <Badge
            label={persona.horizon}
            className={HORIZON_COLORS[persona.horizon] ?? HORIZON_COLORS["mid-term"]}
          />
          <Badge
            label={`temp ${persona.temperature.toFixed(2)}`}
            className="text-slate-400 bg-slate-800/60 border-slate-700"
          />
        </div>
      )}

      {/* Probability */}
      <div>
        <div className="flex items-end justify-between mb-1.5">
          <span className="text-slate-500 text-xs">Probability estimate</span>
          <span className="text-2xl font-bold tabular-nums" style={{ color: dotColor }}>
            {(prob * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${prob * 100}%`,
              background: dotColor,
              transition: "width 0.5s ease",
            }}
          />
        </div>
      </div>

      {/* Confidence */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-slate-500 text-xs">Self-assessed confidence</span>
          <span className="text-white text-xs font-medium tabular-nums">{conf.toFixed(2)}</span>
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: i < Math.round(conf * 10) ? dotColor : "#1e293b",
              }}
            />
          ))}
        </div>
      </div>

      {/* Rationale */}
      <div className="border-t border-slate-800 pt-3 space-y-1">
        <span className="text-slate-500 text-xs uppercase tracking-wider">Rationale</span>
        <p className="text-slate-200 text-sm leading-relaxed">
          "{result.output.key_factor}"
        </p>
      </div>

      {/* Timing */}
      <div className="flex gap-4 text-xs text-slate-600">
        <span>TTFT {(result.ttft * 1000).toFixed(0)}ms</span>
        <span>·</span>
        <span>Total {(result.totalTime * 1000).toFixed(0)}ms</span>
        {result.tokens > 0 && (
          <>
            <span>·</span>
            <span>{result.tokens} tokens</span>
          </>
        )}
      </div>
    </div>
  );
}
