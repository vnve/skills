import { getTtsText, type AssetGroup } from "@vnve/core";
import type { Session } from "./session";
import {
  localMediaUrl,
  mediaRevision,
  putLocalMedia,
} from "./core/local-workspace";
async function removeUpload(path: string) {
  const expected = await mediaRevision(path);
  if (expected) {
    const response = await fetch(localMediaUrl(path), {
      method: "DELETE",
      headers: { "If-Match": expected },
    });
    if (!response.ok) throw new Error("临时素材清理失败");
  }
}
async function upload(file: File, folder: string, extensions: string[]) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!extensions.includes(ext)) throw new Error("不支持此文件格式");
  const path = `assets/${folder}/${crypto.randomUUID()}.${ext}`;
  await putLocalMedia(path, file, null);
  return path;
}
async function duration(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const audio = new Audio();
      const cleanup = () => {
        audio.removeAttribute("src");
        audio.load();
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("音频读取超时"));
      }, 15000);
      audio.onloadedmetadata = () => {
        clearTimeout(timeout);
        const d = audio.duration;
        cleanup();
        Number.isFinite(d) && d > 0
          ? resolve(d)
          : reject(new Error("无法读取音频时长"));
      };
      audio.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error("无法解码此音频"));
      };
      audio.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function importVoice(
  session: Session,
  file: File,
  sceneId: string,
  nodeId: string,
  isActive: () => boolean,
) {
  const initial = session.project.acts
    .flatMap((a) => a.scenes)
    .find((s) => s.id === sceneId)
    ?.script.nodes.find((n) => n.id === nodeId);
  if (!initial) throw new Error("台词已被删除");
  const text = getTtsText(initial),
    speaker = initial.actorId;
  const seconds = await duration(file),
    path = await upload(file, "audio", [
      "wav",
      "mp3",
      "ogg",
      "m4a",
      "aac",
      "flac",
      "webm",
    ]);
  try {
    const current = session.project.acts
      .flatMap((a) => a.scenes)
      .find((s) => s.id === sceneId)
      ?.script.nodes.find((n) => n.id === nodeId);
    if (
      !isActive() ||
      !current ||
      getTtsText(current) !== text ||
      current.actorId !== speaker
    )
      throw new Error("台词或目标作品已改变，请重新导入");
    const project = structuredClone(session.project),
      target = project.acts
        .flatMap((a) => a.scenes)
        .find((s) => s.id === sceneId)!
        .script.nodes.find((n) => n.id === nodeId)!;
    target.audioUrl = path;
    target.audioDuration = seconds;
    delete target.ttsSnapshot;
    target.audioImportSnapshot = {
      text,
      ...(speaker ? { actorId: speaker } : {}),
    };
    session.replace(project);
  } catch (e) {
    await removeUpload(path);
    throw e;
  }
}
async function inspectStaticImage(file: File) {
  // Static bitmap replacement only. Animated/video authoring remains a host workflow.
  const bytes = new Uint8Array(await file.arrayBuffer()),
    view = new DataView(bytes.buffer),
    tag = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
  let animated = false;
  if (tag(1) === "PNG\r") {
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const size = view.getUint32(offset);
      if (tag(offset + 4) === "acTL") animated = true;
      if (size > bytes.length - offset - 12) break;
      offset += 12 + size;
    }
  }
  if (tag(0) === "RIFF" && tag(8) === "WEBP") {
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const size = view.getUint32(offset + 4, true);
      if (["ANIM", "ANMF"].includes(tag(offset))) animated = true;
      if (size > bytes.length - offset - 8) break;
      offset += 8 + size + (size % 2);
    }
  }
  if (tag(4) === "ftyp") {
    const end = Math.min(view.getUint32(0), bytes.length);
    for (let offset = 8; offset + 4 <= end; offset += 4)
      if (tag(offset) === "avis") animated = true;
  }
  if (animated)
    throw new Error("此微调入口仅替换静态图片，请通过 Skill 制作动态素材");
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}
export async function replaceVisual(
  session: Session,
  file: File,
  variantId: string,
  isActive: () => boolean,
) {
  const { width, height } = await inspectStaticImage(file);
  const path = await upload(file, "visual", [
    "png",
    "jpg",
    "jpeg",
    "avif",
    "webp",
  ]);
  try {
    if (!isActive()) throw new Error("目标作品已改变");
    const project = structuredClone(session.project);
    const group = (
      Object.values(project.assets.visual).flat() as AssetGroup[]
    ).find((g) => g.variants.some((v) => v.id === variantId));
    const variant = group?.variants.find((v) => v.id === variantId);
    if (!variant) throw new Error("目标素材已改变");
    Object.assign(variant, { url: path, width, height, mediaType: "static" });
    delete variant.thumbnailUrl;
    delete variant.duration;
    group!.source = "workspace";
    session.replace(project);
  } catch (e) {
    await removeUpload(path);
    throw e;
  }
}

export async function prepareCanvasImages(files: FileList, name: string) {
  const variants: AssetGroup["variants"] = [];
  const paths: string[] = [];
  try {
    for (const file of Array.from(files)) {
      const { width, height } = await inspectStaticImage(file);
      const path = await upload(file, "visual", [
        "png",
        "jpg",
        "jpeg",
        "webp",
        "avif",
      ]);
      paths.push(path);
      variants.push({
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        url: path,
        width,
        height,
        mediaType: "static",
      });
    }
    const group: AssetGroup = {
      id: crypto.randomUUID(),
      name,
      variants,
      defaultVariantId: variants[0]?.id,
    };
    return {
      group,
      rollback: async () => {
        for (const path of paths) await removeUpload(path);
      },
    };
  } catch (error) {
    for (const path of paths) await removeUpload(path);
    throw error;
  }
}
