import type Konva from 'konva';

export interface CaptureStageSnapshotOptions {
  excludeNames?: string[];
  pixelRatio?: number;
}

export function captureStageSnapshot(
  stage: Pick<Konva.Stage, 'find' | 'batchDraw' | 'toCanvas'>,
  options: CaptureStageSnapshotOptions = {},
): CanvasImageSource {
  const { excludeNames = [], pixelRatio = 1 } = options;
  const nodes: Konva.Node[] = [];
  const seen = new Set<Konva.Node>();

  for (const name of excludeNames) {
    const matches = stage.find(`.${name}`) as unknown as Konva.Node[];
    for (const node of matches) {
      if (seen.has(node)) continue;
      seen.add(node);
      nodes.push(node);
    }
  }

  const previousVisibility = nodes.map((node) => node.visible());
  for (const node of nodes) {
    node.visible(false);
  }

  stage.batchDraw();
  const snapshot = stage.toCanvas({ pixelRatio }) as unknown as CanvasImageSource;

  nodes.forEach((node, index) => {
    node.visible(previousVisibility[index] ?? true);
  });
  stage.batchDraw();

  return snapshot;
}
