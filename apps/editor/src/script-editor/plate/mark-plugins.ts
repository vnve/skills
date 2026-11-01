import { createPlatePlugin, PlateLeaf } from "platejs/react";

export const BoldPlugin = createPlatePlugin({
  key: "bold",
  node: {
    isLeaf: true,
    component: PlateLeaf,
    props: ({ leaf }) => ({
      as: "span",
      style: {
        fontWeight: (leaf as Record<string, unknown>).bold ? 700 : undefined,
      },
    }),
  },
  shortcuts: {
    toggleBold: {
      keys: "mod+b",
      handler: ({ editor }) => {
        editor.tf.toggleMark("bold");
      },
    },
  },
});

export const ItalicPlugin = createPlatePlugin({
  key: "italic",
  node: {
    isLeaf: true,
    component: PlateLeaf,
    props: ({ leaf }) => ({
      as: "span",
      style: {
        fontStyle: (leaf as Record<string, unknown>).italic
          ? "italic"
          : undefined,
      },
    }),
  },
  shortcuts: {
    toggleItalic: {
      keys: "mod+i",
      handler: ({ editor }) => {
        editor.tf.toggleMark("italic");
      },
    },
  },
});

/**
 * ColorPlugin — renders text with an inline color style.
 * The mark value is a CSS color string stored on the leaf as `color`.
 */
export const ColorPlugin = createPlatePlugin({
  key: "color",
  node: {
    isLeaf: true,
    component: PlateLeaf,
    props: ({ leaf }) => ({
      as: "span",
      style: {
        color: (leaf as Record<string, unknown>).color as string | undefined,
      },
    }),
  },
});
