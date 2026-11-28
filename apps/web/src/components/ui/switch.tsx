import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  pending?: boolean;
  size?: "sm" | "md";
}

/**
 * Accessible toggle switch (`role="switch"`) with consistent pill geometry,
 * keyboard support (Space / Enter via native button), visible focus ring,
 * and pending/disabled states across light and dark modes.
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked,
      onCheckedChange,
      disabled,
      pending = false,
      size = "md",
      className,
      onClick,
      ...props
    },
    ref,
  ) => {
    const isDisabled = Boolean(disabled || pending);

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-busy={pending || undefined}
        data-state={checked ? "checked" : "unchecked"}
        disabled={isDisabled}
        onClick={event => {
          onClick?.(event);
          if (event.defaultPrevented || isDisabled) return;
          onCheckedChange(!checked);
        }}
        className={cn(
          "peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-out motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-55",
          size === "sm" ? "h-5 w-9" : "h-6 w-11",
          checked
            ? "bg-primary shadow-inner"
            : "bg-slate-300 dark:bg-slate-700",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none flex items-center justify-center rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-out motion-reduce:transition-none dark:bg-slate-100",
            size === "sm" ? "h-4 w-4" : "h-5 w-5",
            checked
              ? size === "sm"
                ? "translate-x-4"
                : "translate-x-5"
              : "translate-x-0",
          )}
        >
          {pending ? (
            <Loader2
              className={cn(
                "animate-spin text-primary",
                size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3",
              )}
            />
          ) : null}
        </span>
      </button>
    );
  },
);

Switch.displayName = "Switch";
