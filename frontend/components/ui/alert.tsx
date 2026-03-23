import * as React from "react";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "destructive";
}

const variantClasses: Record<string, string> = {
  default: "border-slate-700 bg-slate-900 text-slate-100",
  destructive: "border-red-500/50 bg-red-500/10 text-red-400",
};

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="alert"
        className={`rounded-lg border px-4 py-3 text-sm ${variantClasses[variant]} ${className}`}
        {...props}
      />
    );
  }
);
Alert.displayName = "Alert";

export { Alert };
