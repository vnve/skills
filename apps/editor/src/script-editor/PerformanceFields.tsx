import type { AssetGroup } from "@vnve/core";
import React from "react";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import { CompactSelect } from "../CompactSelect";
import { IconButton } from "../EditorControls";
import { useEditorStore, getCurrentScene } from "../stores/editor-store";

export function PerformanceField({
  kind,
  value,
  onChange,
}: {
  kind: "image-list" | "scene-select" | "color" | "image-select";
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const project = useEditorStore((s) => s.project),
    scene = useEditorStore(getCurrentScene);
  if (kind === "color")
    return (
      <input
        type="color"
        aria-label="强调色"
        value={typeof value === "string" ? value : "#a44a42"}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-full rounded border border-white/10 bg-transparent"
      />
    );
  if (kind === "scene-select") {
    const scenes = project.acts.flatMap((a) => a.scenes),
      index = scenes.findIndex((s) => s.id === scene?.id),
      next = scenes[index + 1];
    return (
      <>
        <CompactSelect
          value={typeof value === "string" ? value : ""}
          onValueChange={onChange}
          label="下一场景"
          variant="form"
          options={[
            { value: "", label: "选择紧邻下一场" },
            ...(next ? [{ value: next.id, label: next.name }] : []),
          ]}
        />
        <p className="text-xs text-muted-foreground">
          须独占本场最后一行；转场时长在下一场过渡区间计算。
        </p>
      </>
    );
  }
  const selected = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
  const variants = (
    Object.values(project.assets.visual) as AssetGroup[][]
  ).flatMap((groups) =>
    groups.flatMap((g) =>
      g.variants.map((v) => ({ value: v.id, label: `${g.name} / ${v.name}` })),
    ),
  );
  if (kind === "image-select")
    return (
      <CompactSelect
        label="透明前景素材"
        value={typeof value === "string" ? value : "$none"}
        onValueChange={(v) => onChange(v === "$none" ? undefined : v)}
        options={[
          { value: "$none", label: "无前景（普通背景仍可用）" },
          ...variants,
        ]}
        variant="form"
      />
    );
  const change = (index: number, id: string) => {
    const next = [...selected];
    next[index] = id;
    onChange(next);
  };
  const move = (index: number, delta: number) => {
    const next = [...selected];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };
  const remaining = variants.filter((v) => !selected.includes(v.value));
  return (
    <div className="flex min-w-0 flex-col gap-2" aria-label="记忆图片顺序">
      {selected.map((id, index) => (
        <div className="flex min-w-0 items-center gap-1" key={`${index}-${id}`}>
          <span className="text-xs text-muted-foreground">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <CompactSelect
              value={id}
              onValueChange={(v) => change(index, v)}
              label={`第${index + 1}张图片`}
              variant="form"
              options={variants.filter(
                (v) => v.value === id || !selected.includes(v.value),
              )}
            />
          </div>
          <IconButton
            label="图片上移"
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp className="size-3" />
          </IconButton>
          <IconButton
            label="图片下移"
            disabled={index === selected.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown className="size-3" />
          </IconButton>
          <IconButton
            label="移除图片"
            onClick={() => onChange(selected.filter((_, i) => i !== index))}
          >
            <X className="size-3" />
          </IconButton>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <IconButton
          label="添加记忆图片"
          disabled={selected.length >= 6 || remaining.length === 0}
          onClick={() => onChange([...selected, remaining[0].value])}
        >
          <Plus className="size-3" />
        </IconButton>
        <span className="text-xs text-muted-foreground">
          {selected.length}/6 · 最后一张作为完整画面
        </span>
      </div>
    </div>
  );
}
