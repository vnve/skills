import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const directory = path.resolve(".scratch/common-effects/acceptance");
const report = JSON.parse(
  await readFile(path.join(directory, "report.json"), "utf8"),
);
assert.equal(report.length, 13);
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
  assert.equal(stream.width, result.width);
  assert.equal(stream.height, result.height);
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
