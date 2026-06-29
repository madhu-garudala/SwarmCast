"use client";

import { useEffect, useRef, useState } from "react";
import { AgentResult } from "@/lib/aggregator";

interface DotState {
  id: number;
  phase: "idle" | "thinking" | "landed";
  // Current rendered position (driven by CSS transform)
  x: number;
  y: number;
  opacity: number;
  binIndex: number;
  probability: number | null;
}

interface Props {
  swarmSize: number;
  phase: "idle" | "thinking" | "filling" | "done";
  results: AgentResult[];
  selectedAgentId: number | null;
  onDotClick: (result: AgentResult) => void;
  aggregate: {
    mean: number;
    p10: number;
    p90: number;
    bins: number[];
    confidence_label: string;
  } | null;
}

const BIN_LABELS = ["0–10%", "10–20%", "20–30%", "30–40%", "40–50%", "50–60%", "60–70%", "70–80%", "80–90%", "90–100%"];
const SVG_W = 800;
const SVG_H = 400;
const HIST_TOP = 50;
const HIST_BOT = 320;
const HIST_LEFT = 50;
const HIST_RIGHT = 760;
const HIST_H = HIST_BOT - HIST_TOP;
const BIN_W = (HIST_RIGHT - HIST_LEFT) / 10;
const DOT_R = 5;
const CENTER_X = SVG_W / 2;
const CENTER_Y = (HIST_TOP + HIST_BOT) / 2 - 20;

// Deterministic fan positions using sine/cosine so they're stable across renders
function fanPosition(id: number, total: number) {
  const angle = (id / total) * 2 * Math.PI - Math.PI / 2;
  const rx = 240 + (id % 3) * 20;
  const ry = 110 + (id % 5) * 12;
  return {
    x: CENTER_X + rx * Math.cos(angle),
    y: CENTER_Y + ry * Math.sin(angle),
  };
}

function binTargetPosition(binIndex: number, stackIndex: number) {
  const cx = HIST_LEFT + binIndex * BIN_W + BIN_W / 2;
  const cy = HIST_BOT - DOT_R - stackIndex * (DOT_R * 2 + 2);
  return { x: cx, y: cy };
}

export default function SwarmViz({ swarmSize, phase, results, aggregate, selectedAgentId, onDotClick }: Props) {
  const [dots, setDots] = useState<DotState[]>([]);
  const binStackRef = useRef<number[]>(new Array(10).fill(0));
  const landedIdsRef = useRef<Set<number>>(new Set());

  // Initialize on mount / swarmSize change
  useEffect(() => {
    binStackRef.current = new Array(10).fill(0);
    landedIdsRef.current = new Set();
    const initial: DotState[] = Array.from({ length: swarmSize }, (_, i) => ({
      id: i,
      phase: "idle",
      x: CENTER_X,
      y: CENTER_Y,
      opacity: 0,
      binIndex: 0,
      probability: null,
    }));
    setDots(initial);
  }, [swarmSize]);

  // Fan out on thinking
  useEffect(() => {
    if (phase === "thinking") {
      binStackRef.current = new Array(10).fill(0);
      landedIdsRef.current = new Set();
      setDots(prev =>
        prev.map((d, i) => {
          const pos = fanPosition(i, prev.length);
          return { ...d, phase: "thinking", x: pos.x, y: pos.y, opacity: 1 };
        })
      );
    }
  }, [phase]);

  // Land dots as results arrive
  useEffect(() => {
    if (results.length === 0) return;
    setDots(prev => {
      const next = [...prev];
      for (const r of results) {
        if (landedIdsRef.current.has(r.agentId)) continue;
        const idx = next.findIndex(d => d.id === r.agentId);
        if (idx === -1) continue;
        const prob = r.output.probability ?? 0.5;
        const binIndex = Math.min(9, Math.floor(prob * 10));
        const stackIndex = binStackRef.current[binIndex]++;
        const pos = binTargetPosition(binIndex, stackIndex);
        landedIdsRef.current.add(r.agentId);
        next[idx] = { ...next[idx], phase: "landed", x: pos.x, y: pos.y, binIndex, probability: prob };
      }
      return next;
    });
  }, [results]);

  const maxBin = Math.max(1, ...(aggregate?.bins ?? [1]));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ maxHeight: 400 }}>
        {/* Histogram axes */}
        <line x1={HIST_LEFT} y1={HIST_BOT} x2={HIST_RIGHT} y2={HIST_BOT} stroke="#334155" strokeWidth={1} />
        <line x1={HIST_LEFT} y1={HIST_TOP} x2={HIST_LEFT} y2={HIST_BOT} stroke="#334155" strokeWidth={1} />

        {/* Bar fills (animated via aggregate.bins) */}
        {aggregate?.bins.map((count, i) => {
          const barH = (count / maxBin) * HIST_H * 0.82;
          return (
            <rect
              key={i}
              x={HIST_LEFT + i * BIN_W + 2}
              y={HIST_BOT - barH}
              width={BIN_W - 4}
              height={barH}
              fill="#1e40af"
              opacity={0.3}
              style={{ transition: "height 0.5s ease, y 0.5s ease" }}
            />
          );
        })}

        {/* Confidence band + mean line */}
        {aggregate && phase === "done" && (
          <>
            <rect
              x={HIST_LEFT + aggregate.p10 * (HIST_RIGHT - HIST_LEFT)}
              y={HIST_TOP}
              width={(aggregate.p90 - aggregate.p10) * (HIST_RIGHT - HIST_LEFT)}
              height={HIST_H}
              fill="#3b82f6"
              opacity={0.07}
            />
            <line
              x1={HIST_LEFT + aggregate.mean * (HIST_RIGHT - HIST_LEFT)}
              y1={HIST_TOP - 8}
              x2={HIST_LEFT + aggregate.mean * (HIST_RIGHT - HIST_LEFT)}
              y2={HIST_BOT}
              stroke="#60a5fa"
              strokeWidth={2}
              strokeDasharray="5,3"
            />
            <text
              x={HIST_LEFT + aggregate.mean * (HIST_RIGHT - HIST_LEFT)}
              y={HIST_TOP - 14}
              fill="#93c5fd"
              fontSize={13}
              textAnchor="middle"
              fontWeight={700}
            >
              {(aggregate.mean * 100).toFixed(1)}%
            </text>
          </>
        )}

        {/* Bin labels */}
        {BIN_LABELS.map((label, i) => (
          <text
            key={i}
            x={HIST_LEFT + i * BIN_W + BIN_W / 2}
            y={HIST_BOT + 14}
            fontSize={8}
            fill="#475569"
            textAnchor="middle"
          >
            {label}
          </text>
        ))}
        <text x={CENTER_X} y={HIST_BOT + 28} fontSize={10} fill="#475569" textAnchor="middle">
          Probability (%)
        </text>

        {/* Y-axis labels */}
        {[0, 0.5, 1].map(t => (
          <text
            key={t}
            x={HIST_LEFT - 6}
            y={HIST_BOT - t * HIST_H * 0.82 + 4}
            fontSize={9}
            fill="#475569"
            textAnchor="end"
          >
            {Math.round(t * maxBin)}
          </text>
        ))}

        {/* Dots — original <circle> elements, untouched for animation reliability */}
        {dots.map(dot => {
          const dotColor =
            dot.phase === "landed"
              ? `hsl(${200 + dot.binIndex * 14}, 65%, 58%)`
              : "#64748b";
          return (
            <circle
              key={dot.id}
              r={DOT_R}
              fill={dotColor}
              style={{
                transform: `translate(${dot.x}px, ${dot.y}px)`,
                opacity: dot.opacity,
                transition:
                  dot.phase === "landed"
                    ? "transform 0.65s cubic-bezier(.34,1.56,.64,1), fill 0.3s"
                    : dot.phase === "thinking"
                    ? "transform 0.4s ease-out, opacity 0.3s"
                    : "opacity 0.3s",
                transformBox: "fill-box",
                transformOrigin: "center",
              }}
              className={dot.phase === "thinking" ? "animate-pulse" : ""}
            />
          );
        })}

        {/* Selection ring — rendered on top of dots */}
        {selectedAgentId !== null &&
          dots
            .filter(d => d.id === selectedAgentId && d.phase === "landed")
            .map(dot => {
              const dotColor = `hsl(${200 + dot.binIndex * 14}, 65%, 58%)`;
              return (
                <circle
                  key="sel-ring"
                  r={DOT_R + 4}
                  fill="none"
                  stroke={dotColor}
                  strokeWidth={2}
                  opacity={0.75}
                  style={{
                    transform: `translate(${dot.x}px, ${dot.y}px)`,
                    transition: "transform 0.65s cubic-bezier(.34,1.56,.64,1)",
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    pointerEvents: "none",
                  }}
                />
              );
            })}

        {/* Invisible hit circles — large click targets, only for landed dots, rendered last (topmost) */}
        {dots
          .filter(d => d.phase === "landed")
          .map(dot => {
            const result = results.find(r => r.agentId === dot.id) ?? null;
            return (
              <circle
                key={`hit-${dot.id}`}
                r={DOT_R + 10}
                fill="transparent"
                style={{
                  transform: `translate(${dot.x}px, ${dot.y}px)`,
                  transition: "transform 0.65s cubic-bezier(.34,1.56,.64,1)",
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  cursor: "pointer",
                  pointerEvents: "all",
                }}
                onClick={result ? () => onDotClick(result) : undefined}
              />
            );
          })}

        {/* Center label */}
        {phase === "idle" && (
          <text x={CENTER_X} y={CENTER_Y + 5} fill="#334155" fontSize={13} textAnchor="middle">
            Enter a question above to deploy the swarm
          </text>
        )}
        {phase === "thinking" && (
          <text x={CENTER_X} y={HIST_TOP - 18} fill="#94a3b8" fontSize={11} textAnchor="middle">
            {swarmSize} agents reasoning independently…
          </text>
        )}
        {phase === "filling" && (
          <text x={CENTER_X} y={HIST_TOP - 18} fill="#60a5fa" fontSize={11} textAnchor="middle">
            Results landing in real time…
          </text>
        )}
      </svg>
    </div>
  );
}
