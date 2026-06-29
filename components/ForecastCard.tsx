"use client";

import { AggregateResult } from "@/lib/aggregator";
import { SynthesizerOutput } from "@/lib/schemas";

interface Props {
  aggregate: AggregateResult | null;
  synthesis: SynthesizerOutput | null;
  question: string;
  visible: boolean;
}

const LABEL_COLORS: Record<string, string> = {
  high: "text-emerald-400 bg-emerald-950/60 border-emerald-800",
  moderate: "text-yellow-400 bg-yellow-950/60 border-yellow-800",
  low: "text-red-400 bg-red-950/60 border-red-800",
};

export default function ForecastCard({ aggregate, synthesis, question, visible }: Props) {
  if (!aggregate || !visible) return null;

  const pct = (aggregate.mean * 100).toFixed(1);
  const label = aggregate.confidence_label;
  const labelStyle = LABEL_COLORS[label] ?? LABEL_COLORS.moderate;

  return (
    <div
      className="rounded-xl border border-slate-700 bg-slate-900/80 p-5 space-y-4"
      style={{
        animation: "snap-in 0.4s cubic-bezier(.34,1.56,.64,1) both",
      }}
    >
      <style>{`
        @keyframes snap-in {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Headline */}
      <div className="text-center">
        <div className="text-5xl font-bold text-white tracking-tight">{pct}%</div>
        <div className="text-slate-400 text-sm mt-1 truncate max-w-xs mx-auto" title={question}>
          {question.length > 60 ? question.slice(0, 57) + "…" : question}
        </div>
      </div>

      {/* Confidence badge */}
      <div className="flex justify-center">
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${labelStyle}`}>
          {label.toUpperCase()} CONFIDENCE
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
        <div className="rounded bg-slate-800/60 p-2 text-center">
          <div className="text-white font-medium">{aggregate.valid_count}</div>
          <div>valid agents</div>
        </div>
        <div className="rounded bg-slate-800/60 p-2 text-center">
          <div className="text-white font-medium">{(aggregate.stddev * 100).toFixed(1)}%</div>
          <div>spread (σ)</div>
        </div>
        <div className="rounded bg-slate-800/60 p-2 text-center">
          <div className="text-white font-medium">{(aggregate.p10 * 100).toFixed(0)}%</div>
          <div>10th pct</div>
        </div>
        <div className="rounded bg-slate-800/60 p-2 text-center">
          <div className="text-white font-medium">{(aggregate.p90 * 100).toFixed(0)}%</div>
          <div>90th pct</div>
        </div>
      </div>

      {/* Synthesis */}
      {synthesis && (
        <div className="space-y-2 border-t border-slate-700 pt-3">
          <p className="text-slate-200 text-sm leading-relaxed">{synthesis.consensus_summary}</p>
          <p className="text-slate-400 text-xs leading-relaxed">
            <span className="text-slate-500">Dissent: </span>{synthesis.main_disagreement}
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-slate-600 text-[10px] text-center">
        Confidence-weighted · outlier-trimmed · {aggregate.trimmed_count} trimmed · deterministic aggregation
      </p>
    </div>
  );
}
