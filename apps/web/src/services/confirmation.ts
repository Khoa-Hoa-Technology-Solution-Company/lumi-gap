export type ConfirmationKind = "leave" | "delete" | "approve" | "reject" | "withdraw";
export interface ConfirmationOptions {
  kind: ConfirmationKind;
  description: string;
}
interface PendingConfirmation extends ConfirmationOptions {
  resolve: (confirmed: boolean) => void;
  trigger: HTMLElement | null;
}

let current: PendingConfirmation | null = null;
const listeners = new Set<() => void>();
export const confirmationStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => current,
  settle(confirmed: boolean) {
    const pending = current;
    if (!pending) return;
    current = null;
    listeners.forEach(listener => listener());
    pending.resolve(confirmed);
  },
};

/** Only the first action can own a confirmation. Repeated clicks cannot queue mutations. */
export function confirmAction(options: ConfirmationOptions): Promise<boolean> {
  if (current || !listeners.size) return Promise.resolve(false);
  return new Promise(resolve => {
    current = { ...options, resolve, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    listeners.forEach(listener => listener());
  });
}

export const confirmUnsavedChanges = () => confirmAction({
  kind: "leave",
  description: "Your changes have not been saved. Leaving will discard these changes.",
});
