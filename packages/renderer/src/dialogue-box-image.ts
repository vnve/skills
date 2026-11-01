import type { DialogueBoxImageFit, DialogueBoxImageSlice } from '@vnve/core';

export interface DialogueBoxImageDrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DialogueBoxImageDrawOptions {
  fit?: DialogueBoxImageFit;
  slice?: DialogueBoxImageSlice | null;
  opacity?: number;
}

export interface DialogueBoxImagePatch {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

type ImageDrawer = {
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
};

function sourceSize(image: CanvasImageSource): { width: number; height: number } {
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
  }
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height };
  }
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return { width: image.width, height: image.height };
  }
  const sized = image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  return {
    width: sized.naturalWidth || sized.width || 0,
    height: sized.naturalHeight || sized.height || 0,
  };
}

export function normalizeBoxImageSlice(
  slice?: Partial<DialogueBoxImageSlice> | null,
): DialogueBoxImageSlice | null {
  if (!slice) return null;
  const top = Math.max(0, Number.isFinite(slice.top) ? Number(slice.top) : 0);
  const right = Math.max(0, Number.isFinite(slice.right) ? Number(slice.right) : 0);
  const bottom = Math.max(0, Number.isFinite(slice.bottom) ? Number(slice.bottom) : 0);
  const left = Math.max(0, Number.isFinite(slice.left) ? Number(slice.left) : 0);
  if (top + right + bottom + left <= 0) return null;
  return { top, right, bottom, left };
}

export function clampBoxImageOpacity(opacity: number | undefined): number {
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) return 1;
  return Math.max(0, Math.min(1, opacity));
}

export function layoutDialogueBoxImage(
  image: CanvasImageSource,
  dest: DialogueBoxImageDrawRect,
  options?: DialogueBoxImageDrawOptions,
): DialogueBoxImagePatch[] {
  const { width: imgW, height: imgH } = sourceSize(image);
  if (imgW <= 0 || imgH <= 0 || dest.width <= 0 || dest.height <= 0) return [];

  const slice = normalizeBoxImageSlice(options?.slice);
  if (slice && slice.left + slice.right < imgW && slice.top + slice.bottom < imgH) {
    return layoutNineSlice(imgW, imgH, dest, slice);
  }

  const fit = options?.fit ?? 'stretch';
  if (fit === 'contain') {
    const scale = Math.min(dest.width / imgW, dest.height / imgH);
    const dw = imgW * scale;
    const dh = imgH * scale;
    return [{
      sx: 0,
      sy: 0,
      sw: imgW,
      sh: imgH,
      dx: dest.x + (dest.width - dw) / 2,
      dy: dest.y + (dest.height - dh) / 2,
      dw,
      dh,
    }];
  }

  if (fit === 'cover') {
    const scale = Math.max(dest.width / imgW, dest.height / imgH);
    const srcW = dest.width / scale;
    const srcH = dest.height / scale;
    return [{
      sx: (imgW - srcW) / 2,
      sy: (imgH - srcH) / 2,
      sw: srcW,
      sh: srcH,
      dx: dest.x,
      dy: dest.y,
      dw: dest.width,
      dh: dest.height,
    }];
  }

  return [{
    sx: 0,
    sy: 0,
    sw: imgW,
    sh: imgH,
    dx: dest.x,
    dy: dest.y,
    dw: dest.width,
    dh: dest.height,
  }];
}

function layoutNineSlice(
  imgW: number,
  imgH: number,
  dest: DialogueBoxImageDrawRect,
  slice: DialogueBoxImageSlice,
): DialogueBoxImagePatch[] {
  const hScale = Math.min(1, dest.width / Math.max(1, slice.left + slice.right));
  const vScale = Math.min(1, dest.height / Math.max(1, slice.top + slice.bottom));
  const left = slice.left * hScale;
  const right = slice.right * hScale;
  const top = slice.top * vScale;
  const bottom = slice.bottom * vScale;

  const srcX = [0, slice.left, imgW - slice.right, imgW];
  const srcY = [0, slice.top, imgH - slice.bottom, imgH];
  const dstX = [dest.x, dest.x + left, dest.x + dest.width - right, dest.x + dest.width];
  const dstY = [dest.y, dest.y + top, dest.y + dest.height - bottom, dest.y + dest.height];

  const patches: DialogueBoxImagePatch[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const sw = srcX[col + 1] - srcX[col];
      const sh = srcY[row + 1] - srcY[row];
      const dw = dstX[col + 1] - dstX[col];
      const dh = dstY[row + 1] - dstY[row];
      if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) continue;
      patches.push({
        sx: srcX[col],
        sy: srcY[row],
        sw,
        sh,
        dx: dstX[col],
        dy: dstY[row],
        dw,
        dh,
      });
    }
  }
  return patches;
}

export function drawDialogueBoxImage(
  ctx: ImageDrawer,
  image: CanvasImageSource,
  dest: DialogueBoxImageDrawRect,
  options?: DialogueBoxImageDrawOptions,
): void {
  const patches = layoutDialogueBoxImage(image, dest, options);
  for (const patch of patches) {
    ctx.drawImage(
      image,
      patch.sx,
      patch.sy,
      patch.sw,
      patch.sh,
      patch.dx,
      patch.dy,
      patch.dw,
      patch.dh,
    );
  }
}
