"use client";

import { Priority } from "@/lib/types";
import { priorityColor } from "@/lib/utils";

export function PriorityIcon({
  priority,
  size = 14,
}: {
  priority: Priority;
  size?: number;
}) {
  const color = priorityColor(priority);

  if (priority === "urgent") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
        <rect
          x="1"
          y="1"
          width="12"
          height="12"
          fill={color}
          stroke="#0a0a0a"
          strokeWidth="1.5"
        />
        <rect x="6.25" y="3" width="1.5" height="5" fill="#fafaf7" />
        <rect x="6.25" y="9" width="1.5" height="1.5" fill="#fafaf7" />
      </svg>
    );
  }

  if (priority === "none") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
        <line
          x1="2"
          y1="7"
          x2="12"
          y2="7"
          stroke="#0a0a0a"
          strokeWidth="1.5"
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  const bars: Record<Exclude<Priority, "urgent" | "none">, number[]> = {
    high: [3, 3, 3],
    medium: [3, 3, 0],
    low: [3, 0, 0],
  };
  const [a, b, c] = bars[priority];
  const barDefs = [
    { x: 1.5, h: 4 },
    { x: 5.5, h: 7 },
    { x: 9.5, h: 10 },
  ];
  const active = [a, b, c];

  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      {barDefs.map((d, i) => (
        <rect
          key={i}
          x={d.x}
          y={13 - d.h}
          width="3"
          height={d.h}
          fill={active[i] ? color : "#fafaf7"}
          stroke="#0a0a0a"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
