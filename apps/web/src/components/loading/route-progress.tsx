import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/utils/cn";

/**
 * Prevents loading flicker on fast transitions (< delayMs) while ending
 * immediately as soon as `active` becomes false (never adding artificial hold).
 */
export function useDelayedLoading(active: boolean, delayMs = 160): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return active && visible;
}

// Lightweight reference-counted pending navigation store.
// Activates ONLY when a real Suspense route boundary or navigation transition is pending
// (never triggered by routine background TanStack Query refetches).
let pendingCount = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function beginRoutePending(): () => void {
  pendingCount += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pendingCount = Math.max(0, pendingCount - 1);
    notify();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return pendingCount > 0;
}

/** Place inside a route-level `<Suspense>` fallback to drive `<RouteProgress />`. */
export function RoutePendingSignal() {
  useEffect(() => beginRoutePending(), []);
  return null;
}

/**
 * Thin 2.5px top route progress indicator.
 * - Starts only on real pending route transitions.
 * - Delayed 160ms so instant (<160ms) route switches never flash.
 * - Indeterminate motion (zero fake percentages).
 * - Respects `prefers-reduced-motion`.
 */
export function RouteProgress({ className }: { className?: string }) {
  const active = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const visible = useDelayedLoading(active, 160);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading route"
      aria-busy="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2.5px] overflow-hidden bg-primary/15",
        className,
      )}
    >
      <div className="lumi-indeterminate-bar h-full w-1/2 rounded-r-full bg-primary motion-reduce:w-full motion-reduce:opacity-70" />
    </div>
  );
}
