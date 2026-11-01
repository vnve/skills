export interface ExportFile {
  readonly writeFailed: boolean;
  stream: WritableStream<{
    type: "write";
    data: Uint8Array<ArrayBuffer>;
    position: number;
  }>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export function validateExportFileName(name: string): void {
  if (!name.trim() || name === "." || name === ".." || /[/\\\0]/.test(name)) {
    throw new Error("Invalid export file name");
  }
}
