import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const directory = path.resolve(".scratch/performance-commands/acceptance");
const report = JSON.parse(
  await readFile(path.join(directory, "report.json"), "utf8"),
);
assert.equal(report.length, 6);
assert.ok(report.every((r) => r.passed));
const decode = (file, args = []) =>
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      ...args,
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=480:270",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
const checks = [];
for (const result of report) {
  const video = path.join(directory, result.name + ".mp4");
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-of", "json", video],
      { encoding: "utf8" },
    ),
  );
  const stream = probe.streams.find((s) => s.codec_type === "video");
  assert.equal(stream.width, 1920);
  assert.equal(stream.height, 1080);
  assert.ok(Math.abs(Number(stream.duration) - result.duration) < 0.08);
  for (const [i, time] of result.times.entries()) {
    const png = decode(path.join(directory, `${result.name}-${i}.png`));
    const mp4 = decode(video, ["-ss", String(time)]);
    let error = 0;
    for (let n = 0; n < png.length; n++) error += Math.abs(png[n] - mp4[n]);
    error /= png.length;
    assert.ok(error < 10, `${result.name} frame ${i}: MAE ${error}`);
    checks.push({ name: result.name, time, meanAbsoluteError: error });
  }
}
// The title mask must not erase the paper sibling; an uncached parent used to clear its child caches.
const intro = decode(path.join(directory, "introduce-1.png"));
assert.ok(
  intro[0] > 200 && intro[1] > 200 && intro[2] > 180,
  "Nested title mask erased sibling paper",
);
const awake = decode(path.join(directory, "awake-1.png"));
assert.equal(
  awake[0] + awake[1] + awake[2],
  0,
  "Eye mask must hide the scene edge",
);
await writeFile(
  path.join(directory, "decoded-report.json"),
  JSON.stringify({ passed: true, checks }, null, 2),
);
console.log(
  JSON.stringify({
    passed: true,
    frames: checks.length,
    maxMeanAbsoluteError: Math.max(...checks.map((c) => c.meanAbsoluteError)),
  }),
);
