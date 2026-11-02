import type { ScreeningLiveEvent as ScreeningEvent } from "@trend/shared-types";
export type { ScreeningLiveEvent as ScreeningEvent } from "@trend/shared-types";

type ScreeningEventListener = (event: ScreeningEvent) => void;

export class ScreeningEventHub {
  private readonly listenersByRound = new Map<string, Set<ScreeningEventListener>>();

  subscribe(roundId: string, listener: ScreeningEventListener): () => void {
    const listeners = this.listenersByRound.get(roundId) ?? new Set<ScreeningEventListener>();
    listeners.add(listener);
    this.listenersByRound.set(roundId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listenersByRound.delete(roundId);
      }
    };
  }

  publish(event: ScreeningEvent): void {
    const listeners = this.listenersByRound.get(event.roundId);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("ScreeningEventHub error:", err);
      }
    }
  }
}

export const screeningEventHub = new ScreeningEventHub();
