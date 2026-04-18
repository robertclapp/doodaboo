"use client";

import { Status } from "@/lib/types";
import { statusColor } from "@/lib/utils";

export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  const color = statusColor(status);
  const stroke = "#0a0a0a";
  const sw = 1.5;
  const r = size / 2 - sw / 2;
  const cx = size / 2;
  const cy = size / 2;

  const renderInner = () => {
    switch (status) {
      case "backlog":
        return (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeDasharray="2 2"
          />
        );
      case "todo":
        return (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
        );
      case "in_progress":
        return (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
            />
            <path
              d={`M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`}
              fill={color}
              stroke={stroke}
              strokeWidth={sw}
            />
          </>
        );
      case "in_review":
        return (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
            />
            <path
              d={`M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`}
              fill={color}
              stroke={stroke}
              strokeWidth={sw}
            />
          </>
        );
      case "done":
        return (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={color}
              stroke={stroke}
              strokeWidth={sw}
            />
            <path
              d={`M ${cx - r / 1.6} ${cy} L ${cx - r / 6} ${cy + r / 2.2} L ${cx + r / 1.5} ${cy - r / 2.2}`}
              fill="none"
              stroke="#0a0a0a"
              strokeWidth={sw}
              strokeLinecap="square"
            />
          </>
        );
      case "cancelled":
        return (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={color}
              stroke={stroke}
              strokeWidth={sw}
            />
            <path
              d={`M ${cx - r / 2} ${cy - r / 2} L ${cx + r / 2} ${cy + r / 2} M ${cx + r / 2} ${cy - r / 2} L ${cx - r / 2} ${cy + r / 2}`}
              fill="none"
              stroke="#fafaf7"
              strokeWidth={sw}
              strokeLinecap="square"
            />
          </>
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden
    >
      {renderInner()}
    </svg>
  );
}
