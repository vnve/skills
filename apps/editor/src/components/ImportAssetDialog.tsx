import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";

export interface ImportAssetDialogProps {
  open: boolean;
  assetType: "character" | "background" | "prop" | "cg";
  /** When set, dialog is framed as "import a look" for this cast entry (not a new library character). */
  lookForName?: string;
  onImport: (name: string, files: FileList) => void;
  onCancel: () => void;
}

const VISUAL_FILE_ACCEPT = "image/png,image/jpeg,image/webp,image/avif";

export function ImportAssetDialog({
  open,
  assetType,
  lookForName,
  onImport,
  onCancel,
}: ImportAssetDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLookImport = Boolean(lookForName);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName(lookForName?.trim() ?? "");
      setFiles([]);
      setIsDragOver(false);
    }
  }, [open, lookForName]);

  const addFiles = useCallback((newFiles: File[]) => {
    const mediaFiles = newFiles.filter((f) =>
      /\.(png|jpe?g|webp|avif)$/i.test(f.name),
    );
    if (mediaFiles.length === 0) return;
    setFiles((prev) => {
      const updated = [...prev, ...mediaFiles];
      return updated;
    });
    // Auto-fill name from first file if name is empty
    setName((prev) => {
      if (prev) return prev;
      const firstFile = mediaFiles[0];
      if (firstFile) {
        return firstFile.name.replace(/\.[^/.]+$/, "");
      }
      return prev;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      addFiles(droppedFiles);
    },
    [addFiles],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(Array.from(e.target.files));
      }
      e.target.value = "";
    },
    [addFiles],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = lookForName?.trim() || name.trim();
    if (!trimmed || files.length === 0) return;
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    onImport(trimmed, dt.files);
  }, [name, files, onImport, lookForName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const canSubmit =
    (isLookImport || name.trim().length > 0) && files.length > 0;
  const label = isLookImport
    ? t("dialogs.importAsset.lookLabel")
    : t(`dialogs.importAsset.type.${assetType}`);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isLookImport
              ? t("dialogs.importAsset.lookTitle", { name: lookForName })
              : t("dialogs.importAsset.title", { label })}
          </DialogTitle>
          <DialogDescription className="text-white/50">
            {isLookImport
              ? t("dialogs.importAsset.lookDescription")
              : t("dialogs.importAsset.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name input — hidden for cast look import (uses entry name) */}
          {!isLookImport ? (
            <div>
              <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1.5 block">
                {t("common.name")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("dialogs.importAsset.namePlaceholder", {
                  label,
                })}
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:border-brand/50"
              />
            </div>
          ) : null}

          {/* Drop zone */}
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1.5 block">
              {t("common.files")}
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-md p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
                isDragOver
                  ? "border-brand bg-brand-muted"
                  : "border-white/10 hover:border-white/20 bg-white/[0.02]"
              }`}
            >
              <Upload className="w-6 h-6 text-white/30" />
              <span className="text-xs text-white/40 text-center">
                {t("dialogs.importAsset.dropZone")}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={VISUAL_FILE_ACCEPT}
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 py-1 px-2 bg-white/5 rounded text-xs text-white/70"
                >
                  <span className="flex-1 truncate">{file.name}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="text-[10px] text-white/30 px-2">
                {t("dialogs.importAsset.filesSelected", {
                  count: files.length,
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-md text-sm font-medium transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 bg-brand hover:bg-brand/85 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors"
          >
            {t("common.import")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
