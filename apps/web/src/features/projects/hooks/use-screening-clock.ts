import { useEffect, useRef, useState } from "react";
import type { ScreeningWorkspaceSummary } from "@trend/shared-types";

/** One clock per workspace: countdowns and actionable counters expire together. */
export function useScreeningClock(summary: ScreeningWorkspaceSummary | undefined, refetch: () => unknown) {
  const [now, setNow] = useState(Date.now);
  const callback = useRef(refetch);
  callback.current = refetch;
  const deadlines = [...summary?.myActiveClaims.map(c => c.dueAt) ?? [], ...summary?.myTrackedDisputes?.filter(d => d.needsMyStatement).map(d => d.deadline) ?? []]
    .filter((d): d is string => Boolean(d)).sort().join(",");
  useEffect(() => {
    let previous = Date.now();
    setNow(previous);
    if (!deadlines) return;
    const times = deadlines.split(",").map(d => new Date(d).getTime());
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (times.some(d => d > previous && d <= current)) void callback.current();
      previous = current;
    }, 1000);
    return () => clearInterval(timer);
  }, [deadlines]);
  return now;
}
