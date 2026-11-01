import { compilePlaybackScope } from "@vnve/renderer/playback";
self.onmessage = (event: MessageEvent) => {
  try {
    postMessage({ ok: true, value: compilePlaybackScope(event.data) });
  } catch (error) {
    postMessage({ ok: false, error: String(error) });
  }
};
