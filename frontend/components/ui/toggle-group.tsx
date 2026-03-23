import * as React from "react";

export interface ToggleGroupItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export interface ToggleGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  type?: "single" | "multiple";
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  children: React.ReactNode;
}

const ToggleGroupContext = React.createContext<{
  value: string | string[];
  onChange: (v: string) => void;
} | null>(null);

const ToggleGroup: React.FC<ToggleGroupProps> = ({
  type = "single",
  value,
  onValueChange,
  className = "",
  children,
  ...props
}) => {
  const [internal, setInternal] = React.useState<string | string[]>(
    value ?? (type === "single" ? "" : [])
  );

  React.useEffect(() => {
    if (value !== undefined) setInternal(value);
  }, [value]);

  const current = value !== undefined ? value : internal;

  const onChange = (v: string) => {
    let next: string | string[];
    if (type === "single") {
      next = current === v ? "" : v;
    } else {
      const arr = Array.isArray(current) ? current : [];
      next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    }
    setInternal(next);
    onValueChange?.(next);
  };

  return (
    <ToggleGroupContext.Provider value={{ value: current, onChange }}>
      <div className={`inline-flex rounded-lg border border-slate-700 bg-slate-900 overflow-hidden ${className}`} {...props}>
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
};

const ToggleGroupItem: React.FC<ToggleGroupItemProps> = ({
  value,
  className = "",
  ...props
}) => {
  const ctx = React.useContext(ToggleGroupContext);
  if (!ctx) throw new Error("ToggleGroupItem must be used within ToggleGroup");

  const active = Array.isArray(ctx.value)
    ? ctx.value.includes(value)
    : ctx.value === value;

  return (
    <button
      className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
        active
          ? "bg-purple-600 text-white"
          : "text-slate-400 hover:bg-slate-800 hover:text-white"
      } ${className}`}
      onClick={() => ctx.onChange(value)}
      {...props}
    />
  );
};

export { ToggleGroup, ToggleGroupItem };
