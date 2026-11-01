import React from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./components/ui/select";
/** Compact vnve selector shared by editor forms and dialogs. */
export function CompactSelect({
  value,
  onValueChange,
  options,
  label,
  disabled,
  variant = "compact",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
  variant?: "compact" | "form";
}) {
  const encode = (v: string) => (v === "" ? "__vnve_empty__" : v);
  return (
    <Select
      value={encode(value)}
      disabled={disabled}
      onValueChange={(v) => onValueChange(v === "__vnve_empty__" ? "" : v)}
    >
      <SelectTrigger
        size={variant === "form" ? "default" : "sm"}
        aria-label={label}
        className={
          variant === "form"
            ? "min-w-0"
            : "editor-select w-auto shrink-0 max-w-[260px] h-7 min-w-0 bg-white/5 border-white/10 text-xs text-white/80"
        }
      >
        <SelectValue placeholder="选择作品" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={encode(o.value)} value={encode(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
