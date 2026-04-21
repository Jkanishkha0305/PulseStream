import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "critical" | "warning" | "healthy" | "outline";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    const variants: Record<string, string> = {
      default: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
      critical: "bg-red-500/20 text-red-300 border border-red-500/30",
      warning: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
      healthy: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
      outline: "bg-transparent text-slate-300 border border-slate-700",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge };
