"use client";

import { ViralityScore } from "@/lib/types";
import { describeBand } from "@/lib/virality";

const SIZE = 160;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

/**
 * Bold, near-square gauge that doubles as the hero of the composer panel.
 * Inspired by Apple's clarity-first numerical readouts (large value, small
 * supporting label, single accent color) but rendered with brutalist edges.
 */
export function ScoreGauge({
  score,
  label = "Predicted virality",
  sublabel,
}: {
  score?: ViralityScore;
  label?: string;
  sublabel?: string;
}) {
  const value = score?.value ?? 0;
  const tone = score ? describeBand(score.band).tone : "#a3a3a3";
  const offset = CIRC * (1 - value / 100);

  return (
    <div className="border-[1.5px] border-ink bg-paper p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
        {label}
      </div>
      <div className="mt-2 flex items-center gap-4">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-hidden
          className="shrink-0"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={tone}
            strokeWidth={STROKE}
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{
              transition: "stroke-dashoffset 600ms cubic-bezier(0.2, 0.8, 0.2, 1), stroke 240ms",
            }}
          />
          <text
            x="50%"
            y="48%"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="ui-monospace, Menlo, monospace"
            fontWeight={700}
            fontSize="36"
            fill="currentColor"
          >
            {value.toFixed(0)}
          </text>
          <text
            x="50%"
            y="66%"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="ui-monospace, Menlo, monospace"
            fontSize="9"
            fill="currentColor"
            fillOpacity={0.6}
            letterSpacing={2}
          >
            /100
          </text>
        </svg>
        <div className="flex-1 min-w-0">
          {score ? (
            <>
              <div
                className="inline-flex items-center gap-1 border-[1.5px] border-ink h-6 px-2 font-mono text-[11px] uppercase tracking-widest font-bold"
                style={{ backgroundColor: tone }}
              >
                {describeBand(score.band).label}
              </div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-ink/60">
                Confidence {(score.confidence * 100).toFixed(0)}%
              </div>
              {sublabel && (
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink/40">
                  {sublabel}
                </div>
              )}
            </>
          ) : (
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              Add content to compute a score.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
