import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  color?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className = "", value = 0, max = 100, color = "bg-violet-500", ...props }, ref) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));

    return (
      <div
        ref={ref}
        className={cn("h-2 rounded-full bg-white/5 overflow-hidden", className)}
        {...props}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
