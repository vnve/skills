import { createContext, useContext } from "react";
import type { InlineTag } from "@vnve/core";

interface InlineTagCallbacks {
  onTagClick?: (tagIndex: number, tag: InlineTag, rect: DOMRect) => void;
  onTagDelete?: (tagIndex: number) => void;
  readOnly?: boolean;
  /**
   * Frozen merged runs while editing tag params.
   * Each item is a list of tag indices in one merged parallel run.
   */
  frozenParallelRuns?: number[][];
}

const InlineTagContext = createContext<InlineTagCallbacks>({});

export const InlineTagProvider = InlineTagContext.Provider;

export function useInlineTagCallbacks() {
  return useContext(InlineTagContext);
}
