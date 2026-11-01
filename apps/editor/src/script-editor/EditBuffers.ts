import { createContext } from "react";
export class EditBufferMap extends Map<string, () => boolean> {
  constructor(private changed: (size: number) => void) {
    super();
  }
  set(key: string, value: () => boolean) {
    super.set(key, value);
    this.changed(this.size);
    return this;
  }
  delete(key: string) {
    const removed = super.delete(key);
    if (removed) this.changed(this.size);
    return removed;
  }
}
export const EditBuffers = createContext(new Map<string, () => boolean>());
export function flushEdits(buffers: Map<string, () => boolean>) {
  for (const commit of [...buffers.values()]) if (!commit()) return false;
  return true;
}
