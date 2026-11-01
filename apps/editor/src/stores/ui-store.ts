import { useSyncExternalStore } from "react";
export type PointPickerRequest = {
  callback: (point: { x: number; y: number }) => void;
  ghostActorId?: string;
};
let pointPickerRequest: PointPickerRequest | null = null;
const listeners = new Set<() => void>();
function setPointPickerRequest(request: PointPickerRequest | null) {
  pointPickerRequest = request;
  listeners.forEach((listener) => listener());
}
export const useUIStore = {
  getState: () => ({ pointPickerRequest, setPointPickerRequest }),
};
export function usePointPicker() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => pointPickerRequest,
  );
}
