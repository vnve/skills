import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const directory = path.resolve(
  process.argv[2] ?? ".scratch/visual-primitives/acceptance",
);
const ffmpeg = (args) =>
  execFileSync("ffmpeg", ["-v", "error", ...args], {
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60000,
  });
const acceptance = JSON.parse(
  await readFile(path.join(directory, "report.json"), "utf8"),
);
assert.equal(
  acceptance.passed,
  true,
  "Browser acceptance must pass before decoded-frame verification",
);
const report = [];
for (const name of ["daily", "impact", "dream"]) {
  const file = path.join(directory, `${name}.mp4`);
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
  const video = probe.streams.find((s) => s.codec_type === "video");
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.r_frame_rate, "30/1");
  assert.ok(Number(probe.format.duration) >= 3);
  for (const [index, time] of [0, 0.2, 1, 2.5, 89 / 30].entries()) {
    const decoded = ffmpeg([
      "-ss",
      String(Math.round(time * 30) / 30),
      "-i",
      file,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
    const reference = ffmpeg([
      "-i",
      path.join(directory, `${name}-${index}.png`),
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
    assert.equal(decoded.length, reference.length);
    const regions = {
      frame: [0, 0, 1920, 1080],
      actor: [600, 100, 720, 800],
      dialogue: [100, 820, 1720, 240],
    };
    for (const [region, [x, y, w, h]] of Object.entries(regions)) {
      let difference = 0;
      for (let py = y; py < y + h; py++)
        for (let px = x; px < x + w; px++)
          for (let c = 0; c < 3; c++) {
            const offset = (py * 1920 + px) * 3 + c;
            difference += Math.abs(decoded[offset] - reference[offset]);
          }
      const error = difference / (w * h * 3 * 255);
      assert.ok(error < 0.05, `${name} ${time} ${region} error=${error}`);
      report.push({ name, time, region, normalizedMeanError: error });
    }
    if (index === 2)
      await writeFile(
        path.join(directory, `${name}-decoded.png`),
        ffmpeg([
          "-ss",
          String(time),
          "-i",
          file,
          "-frames:v",
          "1",
          "-f",
          "image2pipe",
          "-vcodec",
          "png",
          "pipe:1",
        ]),
      );
  }
}
await writeFile(
  path.join(directory, "video-verification.json"),
  JSON.stringify({ passed: true, frames: 15, comparisons: report }, null, 2),
);
console.log(
  "Three 1080p/30 MP4s decoded; 15 frames and 45 region comparisons passed.",
);
