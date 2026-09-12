import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";


export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const next = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className="rounded-full text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 dark:hover:text-red-400"
      onClick={() => setTheme(next)}
    >
      {theme === "dark" ? (
        <>
          <Sun className="h-5 w-5" /> 
        </>
      ) : (
        <>
          <Moon className="h-5 w-5" />
        </>
      )}
    </Button>
  );
}