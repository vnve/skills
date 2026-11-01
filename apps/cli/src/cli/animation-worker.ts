import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { buildAnimation } from "@vnve/authoring";
import { ANIMATION_BUDGET } from "@vnve/core";
export async function runAnimationWorker() {
  let source = "";
  for await (const chunk of process.stdin) {
    source += chunk;
    if (Buffer.byteLength(source) > ANIMATION_BUDGET.bytes)
      throw new Error("Visual source budget exceeded");
  }
  const input = JSON.parse(source) as {
    source: string;
    context: import("@vnve/authoring").AuthoringContext;
  };
  if (Buffer.byteLength(input.source) > ANIMATION_BUDGET.source)
    throw new Error("Animation source budget exceeded");
  const build = () =>
    buildAnimation(
      runInNewContext(
        `(${input.source.trim().replace(/;$/, "")}\n)`,
        {},
        { timeout: 1000 },
      ),
      input.source,
      input.context,
    );
  const first = build();
  if (JSON.stringify(first) !== JSON.stringify(build()))
    throw new Error("Visual build must be repeatable");
  process.stdout.write(JSON.stringify(first));
}
if (import.meta.main)
  runAnimationWorker().catch((error) => {
    process.stderr.write(
      JSON.stringify({ message: error.message, issues: error.issues }),
    );
    process.exitCode = 1;
  });
