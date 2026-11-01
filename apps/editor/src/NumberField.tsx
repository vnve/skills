import { Input } from "./components/ui/input";
import React, { useEffect, useId, useState } from "react";
import { toast } from "./components/ui/sonner";

/** Invalid drafts are explicitly restored on blur, so saved and visible values agree. */
export function NumberField({
  value,
  min,
  max,
  step = 1,
  onCommit,
  wrapperClassName,
  ...props
}: {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => unknown;
  "aria-label": string;
  className?: string;
  wrapperClassName?: string;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [error, setError] = useState("");
  const id = useId();
  useEffect(() => {
    setDraft(value === undefined ? "" : String(value));
    setError("");
  }, [value]);
  function commit() {
    if (value === undefined && !draft.trim()) return;
    const next = Number(draft);
    if (
      !draft.trim() ||
      !Number.isFinite(next) ||
      (min !== undefined && next < min) ||
      (max !== undefined && next > max)
    ) {
      const range =
        min !== undefined && max !== undefined
          ? `${min}–${max}`
          : min !== undefined
            ? `不小于 ${min} 的数值`
            : max !== undefined
              ? `不大于 ${max} 的数值`
              : "有效数值";
      const message = `请输入 ${range}；已恢复为 ${value ?? "未设置"}`;
      setDraft(value === undefined ? "" : String(value));
      setError(message);
      toast.error(message);
      return;
    }
    setError("");
    setDraft(String(next));
    if (next !== value && onCommit(next) === false)
      setDraft(value === undefined ? "" : String(value));
  }
  return (
    <span className={`number-field ${wrapperClassName ?? ""}`}>
      <Input
        {...props}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-invalid={!!error}
        aria-describedby={error ? id : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setError("");
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            setDraft(value === undefined ? "" : String(value));
            setError("");
          }
        }}
      />
      {error && (
        <small id={id} role="status" className="field-error">
          {error}
        </small>
      )}
    </span>
  );
}
