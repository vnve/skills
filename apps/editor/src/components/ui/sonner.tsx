import React from "react";
import { Toaster as Sonner, toast } from "sonner";
export { toast };
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      richColors
      toastOptions={{ className: "editor-notification", duration: 3200 }}
    />
  );
}
