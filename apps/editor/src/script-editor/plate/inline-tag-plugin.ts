import { createPlatePlugin } from "platejs/react";

export const InlineTagPlugin = createPlatePlugin({
  key: "inline-tag",
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    type: "inline-tag",
  },
});
