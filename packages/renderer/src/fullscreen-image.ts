/** Source crop for an image that fills the stage without changing its aspect ratio. */
export function getFullScreenImageCrop(image: CanvasImageSource | null | undefined, width: number, height: number) {
  const source = image as {
    naturalWidth?: number; naturalHeight?: number;
    videoWidth?: number; videoHeight?: number;
    displayWidth?: number; displayHeight?: number;
    width?: number; height?: number;
  } | null | undefined;
  const sourceWidth = source?.naturalWidth || source?.videoWidth || source?.displayWidth || source?.width || 0;
  const sourceHeight = source?.naturalHeight || source?.videoHeight || source?.displayHeight || source?.height || 0;
  if (![sourceWidth, sourceHeight, width, height].every((value) => Number.isFinite(value) && value > 0)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  return {
    x: (sourceWidth - cropWidth) / 2,
    y: (sourceHeight - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}
