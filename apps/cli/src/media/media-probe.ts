import { imageSizeFromFile } from "image-size/fromFile";
import { Input, FilePathSource, ALL_FORMATS } from "mediabunny";
import { open, stat } from "node:fs/promises";
import path from "node:path";
export type MediaMetadata =
  | {
      kind: "image";
      width: number;
      height: number;
      mediaType: "static" | "animated";
    }
  | { kind: "audio"; duration: number }
  | { kind: "font" };
export async function probeMedia(
  file: string,
  kind: "image" | "audio" | "font",
): Promise<MediaMetadata> {
  const info = await stat(file);
  if (!info.isFile() || !info.size || info.size > 512 * 1024 * 1024)
    throw new Error("Media must be a non-empty file up to 512 MiB");
  const ext = path.extname(file).toLowerCase();
  if (kind === "image") {
    const dimensions = await imageSizeFromFile(file);
    const allowed: Record<string, string[]> = {
      ".png": ["png"],
      ".jpg": ["jpg"],
      ".jpeg": ["jpg"],
      ".webp": ["webp"],
      ".avif": ["heif", "avif"],
      ".gif": ["gif"],
    };
    if (!allowed[ext]?.includes(dimensions.type ?? ""))
      throw new Error(
        "Image contents do not match the supported file extension",
      );
    const width =
        dimensions.orientation && dimensions.orientation >= 5
          ? dimensions.height
          : dimensions.width,
      height =
        dimensions.orientation && dimensions.orientation >= 5
          ? dimensions.width
          : dimensions.height;
    if (!width || !height || width > 32768 || height > 32768)
      throw new Error("Image dimensions are invalid or too large");
    const handle = await open(file, "r");
    let animated = ext === ".gif";
    try {
      const header = Buffer.alloc(Math.min(info.size, 1024 * 1024));
      await handle.read(header, 0, header.length, 0);
      if (ext === ".png")
        for (let offset = 8; offset + 8 <= header.length; ) {
          const size = header.readUInt32BE(offset),
            type = header.toString("ascii", offset + 4, offset + 8);
          if (type === "acTL") {
            animated = true;
            break;
          }
          if (type === "IDAT" || type === "IEND") break;
          offset += size + 12;
        }
      if (ext === ".webp")
        for (let offset = 12; offset + 8 <= header.length; ) {
          const type = header.toString("ascii", offset, offset + 4),
            size = header.readUInt32LE(offset + 4);
          if (
            type === "ANIM" ||
            type === "ANMF" ||
            (type === "VP8X" &&
              offset + 8 < header.length &&
              header[offset + 8] & 2)
          ) {
            animated = true;
            break;
          }
          offset += 8 + size + (size % 2);
        }
      if (
        ext === ".avif" &&
        header.length >= 16 &&
        header.toString("ascii", 4, 8) === "ftyp"
      )
        for (
          let offset = 8;
          offset + 4 <= Math.min(header.readUInt32BE(0), header.length);
          offset += 4
        )
          if (
            offset !== 12 &&
            header.toString("ascii", offset, offset + 4) === "avis"
          )
            animated = true;
    } finally {
      await handle.close();
    }
    return {
      kind: "image",
      width,
      height,
      mediaType: animated ? "animated" : "static",
    };
  }
  if (kind === "font") {
    const handle = await open(file, "r");
    try {
      const header = Buffer.alloc(4);
      await handle.read(header, 0, 4, 0);
      const magic = header.toString("latin1");
      if (
        !(
          (ext === ".ttf" && header.readUInt32BE(0) === 0x00010000) ||
          (ext === ".otf" && magic === "OTTO") ||
          (ext === ".woff" && magic === "wOFF") ||
          (ext === ".woff2" && magic === "wOF2")
        )
      )
        throw new Error("Font header does not match its extension");
      return { kind: "font" };
    } finally {
      await handle.close();
    }
  }
  const input = new Input({
    source: new FilePathSource(file),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("Media has no audio track");
    const duration = await track.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("Audio duration is invalid");
    return { kind: "audio", duration };
  } finally {
    input.dispose();
  }
}
export function validateDeclaredMetadata(
  input: { width?: number; height?: number; duration?: number },
  actual: MediaMetadata,
) {
  if (
    actual.kind === "image" &&
    ((input.width !== undefined && input.width !== actual.width) ||
      (input.height !== undefined && input.height !== actual.height))
  )
    throw new Error("Declared image dimensions differ from the media");
  if (
    actual.kind === "audio" &&
    input.duration !== undefined &&
    (!Number.isFinite(input.duration) ||
      Math.abs(input.duration - actual.duration) >
        Math.max(0.05, actual.duration * 0.001))
  )
    throw new Error("Declared duration differs from the audio track");
}
