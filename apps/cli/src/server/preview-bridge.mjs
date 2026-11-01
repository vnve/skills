import { randomUUID } from "node:crypto";
/** A bounded rendezvous: only an authenticated real browser supplies rendered pixels. */
export function previewBridge() {
  let pending;
  return {
    request(input) {
      if (pending)
        return Promise.resolve({
          ok: false,
          code: "PREVIEW_BUSY",
          message: "Another preview request is active",
        });
      if (
        !input ||
        typeof input.projectId !== "string" ||
        !Array.isArray(input.times) ||
        !input.times.length ||
        input.times.length > 12 ||
        input.times.some((t) => !Number.isFinite(t) || t < 0 || t > 3600)
      )
        return Promise.resolve({ ok: false, code: "INVALID_PREVIEW_REQUEST" });
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending = undefined;
          resolve({
            ok: false,
            code: "PREVIEW_UNVERIFIED",
            message:
              "No browser completed this request; open the workspace launch URL in Chrome/Edge and retry",
            verifiedBrowser: false,
          });
        }, 20000);
        pending = {
          job: {
            id: randomUUID(),
            projectId: input.projectId,
            times: input.times,
            sceneId:
              typeof input.sceneId === "string" ? input.sceneId : undefined,
          },
          claimed: false,
          resolve,
          timer,
        };
      });
    },
    next() {
      if (!pending || pending.claimed) return {};
      pending.claimed = true;
      return pending.job;
    },
    complete(input) {
      if (!pending || input.id !== pending.job.id) return false;
      const job = pending;
      pending = undefined;
      clearTimeout(job.timer);
      job.resolve(input.result);
      return true;
    },
    close() {
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve({
          ok: false,
          code: "PREVIEW_UNVERIFIED",
          verifiedBrowser: false,
        });
        pending = undefined;
      }
    },
  };
}
