import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  animationClipSchema,
  ANIMATION_BUDGET,
  type AnimationClip,
} from "@vnve/core";
/** Build an unapplied artifact. Child output and lifetime are bounded independently of author code. */
export async function buildAnimationSource(
  source: string,
  context: import("@vnve/authoring").AuthoringContext,
  worker?: { executable: string; args: string[] },
  timeoutMs: number = ANIMATION_BUDGET.executionMs,
): Promise<AnimationClip> {
  if (Buffer.byteLength(source) > ANIMATION_BUDGET.source)
    throw new Error("Visual source budget exceeded");
  const executable =
    worker?.executable ??
    createRequire(import.meta.url).resolve("bun/bin/bun.exe");
  const args = worker?.args ?? [
    fileURLToPath(new URL("./animation-worker.ts", import.meta.url)),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "",
      errors = "",
      bytes = 0,
      settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        child.kill("SIGKILL");
        reject(error);
        return;
      }
      try {
        resolve(animationClipSchema.parse(JSON.parse(output)));
      } catch (e) {
        reject(e);
      }
    };
    const timer = setTimeout(
      () => finish(new Error("Visual build execution timed out")),
      timeoutMs,
    );
    child.on("error", finish);
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > ANIMATION_BUDGET.bytes)
        finish(new Error("Visual artifact byte budget exceeded"));
      else output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (errors.length < 10000)
        errors += chunk.toString().slice(0, 10000 - errors.length);
    });
    child.on("close", (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(errors || `Visual build failed (${code})`),
      ),
    );
    child.stdin.end(JSON.stringify({ source, context }));
  });
}
