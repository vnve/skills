import { ChevronDown, Image, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export interface CanvasLookOption {
  id: string;
  name?: string;
}

interface CanvasLookMenuProps {
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variants: CanvasLookOption[];
  currentId?: string;
  currentLabel?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  switchTitle: string;
  addLabel: string;
  emptyLabel: string;
  testId?: string;
  addTestId?: string;
  pending?: boolean;
  pendingLabel?: string;
  onComplete?: () => void;
}

const lookTriggerClass =
  "flex h-8 max-w-40 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70";

export function CanvasLookMenu({
  disabled = false,
  open,
  onOpenChange,
  variants,
  currentId,
  currentLabel,
  onSelect,
  onAdd,
  switchTitle,
  addLabel,
  emptyLabel,
  testId = "canvas-toolbar-variant",
  addTestId = "canvas-toolbar-add-variant",
  pending = false,
  pendingLabel,
  onComplete,
}: CanvasLookMenuProps) {
  if (pending && variants.length === 0 && onComplete) {
    return (
      <button
        disabled={disabled}
        type="button"
        data-testid={`${testId}-complete`}
        onClick={onComplete}
        className={`${lookTriggerClass} text-white/65 hover:bg-white/10 hover:text-white`}
        title={pendingLabel ?? switchTitle}
        aria-label={pendingLabel ?? switchTitle}
      >
        <Image className="size-4" />
        <span className="max-w-24 truncate">{pendingLabel ?? switchTitle}</span>
      </button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          disabled={disabled}
          type="button"
          data-testid={testId}
          className={`${lookTriggerClass} text-white/65 hover:bg-white/10 hover:text-white`}
          title={pending ? (pendingLabel ?? switchTitle) : switchTitle}
          aria-label={pending ? (pendingLabel ?? switchTitle) : switchTitle}
        >
          <Image className="size-4" />
          <span className="max-w-24 truncate">
            {pending
              ? (pendingLabel ?? switchTitle)
              : (currentLabel ?? switchTitle)}
          </span>
          <ChevronDown className="size-3 text-white/35" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] w-40 overflow-y-auto"
      >
        {pending && onComplete ? (
          <DropdownMenuItem
            data-testid={`${testId}-complete`}
            onSelect={onComplete}
            className="text-xs text-white/80"
          >
            <Image className="size-3.5" />
            {pendingLabel ?? switchTitle}
          </DropdownMenuItem>
        ) : null}
        {variants.map((variant) => (
          <DropdownMenuItem
            key={variant.id}
            data-testid={`${testId}-${variant.id}`}
            onSelect={() => onSelect(variant.id)}
            className={`truncate text-xs ${variant.id === currentId ? "text-brand" : "text-white/80"}`}
          >
            {variant.name || variant.id}
          </DropdownMenuItem>
        ))}
        {variants.length === 0 && !pending && (
          <div className="px-2 py-1.5 text-xs text-white/30">{emptyLabel}</div>
        )}
        {pending && variants.length === 0 ? null : (
          <>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              data-testid={addTestId}
              onSelect={onAdd}
              className="text-xs text-white/80"
            >
              <Plus className="size-3.5" />
              {addLabel}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
