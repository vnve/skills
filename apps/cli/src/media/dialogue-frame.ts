import { open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { BUILTIN_DIALOGUE_THEME_IDS, dialogueThemeSchema } from "@vnve/core";
import type { openLocalWorkspace } from "../workspace/workspace";

export async function importDialogueFrame(
  workspace: Awaited<ReturnType<typeof openLocalWorkspace>>,
  projectId: string,
  input: {
    file: string;
    theme?: unknown;
    width?: number;
    height?: number;
    sourceUrl?: string;
    license?: string;
  },
) {
  const theme = dialogueThemeSchema.parse(input.theme);
  const loaded = await workspace.loadProject(projectId);
  if (
    (BUILTIN_DIALOGUE_THEME_IDS as readonly string[]).includes(theme.id) ||
    loaded.assets.themes.some((candidate) => candidate.id === theme.id)
  )
    throw new Error(
      "Use a new theme ID; shared themes are never overwritten by frame import",
    );
  const source = await open(input.file, "r");
  let width: number;
  let height: number;
  try {
    const stat = await source.stat();
    if (!stat.isFile() || stat.size > 512 * 1024 * 1024)
      throw new Error("Frame must be a PNG file below 512 MiB");
    const header = Buffer.alloc(24);
    const result = await source.read(header, 0, 24, 0);
    if (
      result.bytesRead !== 24 ||
      !header
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      header.toString("ascii", 12, 16) !== "IHDR" ||
      header.readUInt32BE(8) !== 13
    )
      throw new Error("Dialogue frame import currently supports PNG");
    let offset = 8;
    let imageData = false;
    for (let chunks = 0; chunks < 10000 && offset + 12 <= stat.size; chunks++) {
      const chunk = Buffer.alloc(8);
      if ((await source.read(chunk, 0, 8, offset)).bytesRead !== 8)
        throw new Error("Incomplete PNG chunk");
      const length = chunk.readUInt32BE(0);
      if (offset + length + 12 > stat.size)
        throw new Error("Invalid PNG chunk length");
      const type = chunk.toString("ascii", 4, 8);
      if (type === "acTL")
        throw new Error("Animated PNG frames are not supported");
      if (type === "IDAT") {
        imageData = true;
        break;
      }
      offset += length + 12;
    }
    if (!imageData) throw new Error("PNG has no image data");
    width = header.readUInt32BE(16);
    height = header.readUInt32BE(20);
    if (!width || !height || width > 32768 || height > 32768)
      throw new Error("Invalid PNG dimensions");
  } finally {
    await source.close();
  }
  if (
    (input.width !== undefined && input.width !== width) ||
    (input.height !== undefined && input.height !== height)
  )
    throw new Error("Supplied frame dimensions do not match PNG metadata");
  const slice = theme.data.boxImageSlice;
  if (
    slice &&
    (slice.left + slice.right >= width || slice.top + slice.bottom >= height)
  )
    throw new Error("Nine-slice insets must leave a nonempty source center");
  const id = randomUUID();
  const relative = `assets/visual/${id}.png`;
  const registered = {
    ...theme,
    data: { ...theme.data, boxImageAssetId: id, boxImageUrl: relative },
  };
  await workspace.files.writeStream(
    relative,
    createReadStream(input.file),
    null,
    512 * 1024 * 1024,
  );
  const sourcePath = `assets/sources/${id}.json`;
  await workspace.files.write(
    sourcePath,
    Buffer.from(
      JSON.stringify(
        {
          assetPath: relative,
          sourceUrl: input.sourceUrl ?? null,
          license: input.license ?? null,
        },
        null,
        2,
      ),
    ),
    null,
  );
  const saved = await workspace.execute({
    op: "save",
    projectId,
    assets: { ...loaded.assets, themes: [...loaded.assets.themes, registered] },
    expected: {
      projectRevision: loaded.projectRevision,
      assetsRevision: loaded.assetsRevision,
    },
  });
  return {
    path: relative,
    provenance: sourcePath,
    themeId: theme.id,
    width,
    height,
    ...saved,
  };
}
