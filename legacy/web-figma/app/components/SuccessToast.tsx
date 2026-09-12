import { CheckCircle2, X } from 'lucide-react';

type SuccessToastProps = {
  message: string;
  onDismiss: () => void;
};

export function SuccessToast({ message, onDismiss }: SuccessToastProps) {
  return (
    <div className="fixed left-4 right-4 top-32 z-[80] md:left-auto md:right-4 md:top-20 md:w-[min(360px,calc(100vw-2rem))]">
      <div
        className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 shadow-[0_16px_40px_rgba(16,185,129,0.16)] backdrop-blur"
        role="status"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">Success</p>
          <p className="text-sm font-medium text-foreground">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full p-1.5 text-emerald-700 transition-colors hover:bg-emerald-100"
          aria-label="Dismiss success message"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
