import * as React from "react";

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const DialogContext = React.createContext<{
  open: boolean;
  onChange: (v: boolean) => void;
} | null>(null);

export function Dialog({ open: controlled, onOpenChange, children }: DialogProps) {
  const [internal, setInternal] = React.useState(false);
  const open = controlled ?? internal;
  const onChange = onOpenChange ?? setInternal;

  return (
    <DialogContext.Provider value={{ open, onChange }}>
      {children}
    </DialogContext.Provider>
  );
}

export interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ className = "", onClick, ...props }, ref) => {
    const ctx = React.useContext(DialogContext);
    if (!ctx) throw new Error("DialogTrigger must be used within Dialog");
    return (
      <button
        ref={ref}
        className={className}
        onClick={(e) => {
          ctx.onChange(true);
          onClick?.(e);
        }}
        {...props}
      />
    );
  }
);
DialogTrigger.displayName = "DialogTrigger";

export interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DialogContent({ className = "", children, ...props }: DialogContentProps) {
  const ctx = React.useContext(DialogContext);
  if (!ctx || !ctx.open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={() => ctx.onChange(false)}
      />
      <div className={`fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl ${className}`} {...props}>
        {children}
        <button
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
          onClick={() => ctx.onChange(false)}
        >
          ✕
        </button>
      </div>
    </>
  );
}

export function DialogHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`mb-4 ${className}`} {...props} />;
}

export function DialogTitle({ className = "", ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`text-lg font-semibold text-white ${className}`} {...props} />;
}

export function DialogFooter({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`mt-6 flex justify-end gap-2 ${className}`} {...props} />;
}
