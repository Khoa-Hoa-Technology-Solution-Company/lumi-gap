import type { ReactNode } from "react";
import type { ScreeningTone } from "../screening-status";
import "../screening-status.css";

export function ScreeningStatusBadge({ tone, children, className = "", state }: {
  tone: ScreeningTone; children: ReactNode; className?: string; state?: string;
}) {
  return <span className={`screening-tone screening-status-badge ${className}`} data-tone={tone} data-state={state}>{children}</span>;
}
