import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const ffmpeg = (args) =>
  execFileSync("ffmpeg", ["-v", "error", ...args], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000,
  });
const pcm = (file) =>
  ffmpeg([
    "-i",
    file,
    "-map",
    "0:a:0",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-f",
    "f32le",
    "pipe:1",
  ]);
function correlation(reference, output, lag, stride = 16) {
  let xy = 0,
    xx = 0,
    yy = 0;
  // Exclude the first/last 100ms and require the whole remaining speech interval.
  for (let i = 1600; i < reference.length / 4 - 1600; i += stride) {
    const j = i + lag;
    if (j < 0 || j >= output.length / 4) return -1;
    const x = reference.readFloatLE(i * 4),
      y = output.readFloatLE(j * 4);
    xy += x * y;
    xx += x * x;
    yy += y * y;
  }
  return xx && yy ? xy / Math.sqrt(xx * yy) : 0;
}
export async function verifyVideo({
  directory,
  fixture,
  compiled,
  frameTimes,
}) {
  const exports = path.join(fixture.workspace, "exports");
  const names = (await readdir(exports)).filter((name) =>
    name.endsWith(".mp4"),
  );
  assert.equal(names.length, 1, "Expected one committed full-project export");
  const file = path.join(exports, names[0]);
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8", timeout: 60_000 },
    ),
  );
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  assert.equal(video?.codec_name, "h264");
  assert.equal(audio?.codec_name, "aac");
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.avg_frame_rate, "30/1");
  assert.equal(Number(video.nb_read_frames), Math.ceil(compiled.duration * 30));
  assert.ok(
    Math.abs(Number(video.duration) - compiled.duration) <= 1 / 30 + 0.001,
    "Video duration differs by more than one frame",
  );
  assert.ok(
    Math.abs(Number(audio.duration) - compiled.duration) <= 0.15,
    "Audio unexpectedly truncated or extended",
  );
  // ffprobe alone can accept truncated packets; decode both streams to completion.
  ffmpeg(["-xerror", "-i", file, "-f", "null", "-"]);
  const timestamps = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "frame=best_effort_timestamp_time",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 60_000 },
    ),
  ).frames.map((frame) => Number(frame.best_effort_timestamp_time));
  assert.equal(timestamps.length, Number(video.nb_read_frames));
  assert.ok(
    timestamps.every(
      (value, index) =>
        Number.isFinite(value) && (!index || value > timestamps[index - 1]),
    ),
    "Non-monotonic video timestamps",
  );
  const reference = pcm(fixture.voice),
    output = pcm(file);
  let best = { correlation: -1, lagSamples: 0 };
  for (let lag = -1600; lag <= 1600; lag += 16) {
    const value = correlation(reference, output, lag);
    if (value > best.correlation)
      best = { correlation: value, lagSamples: lag };
  }
  const coarse = best.lagSamples;
  for (let lag = coarse - 16; lag <= coarse + 16; lag++) {
    const value = correlation(reference, output, lag);
    if (value > best.correlation)
      best = { correlation: value, lagSamples: lag };
  }
  best.lagMs = best.lagSamples / 16;
  assert.ok(
    best.correlation >= 0.9,
    `Real speech correlation too low: ${best.correlation}`,
  );
  assert.ok(
    Math.abs(best.lagMs) <= 50,
    `Speech offset exceeds 50ms: ${best.lagMs}`,
  );
  const regions = [];
  for (const [index, time] of frameTimes.entries()) {
    const preview = path.join(directory, `preview-${index}.png`);
    const exported = path.join(directory, `export-${index}.png`);
    const frameNumber = Math.round(time * 30);
    ffmpeg([
      "-i",
      file,
      "-vf",
      `select=eq(n\\,${frameNumber})`,
      "-frames:v",
      "1",
      "-y",
      exported,
    ]);
    const pixels = (image) =>
      ffmpeg([
        "-i",
        image,
        "-vf",
        "scale=480:270",
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ]);
    const left = pixels(preview),
      right = pixels(exported);
    assert.equal(left.length, 480 * 270 * 3);
    assert.equal(right.length, left.length);
    for (const [name, start, end] of [
      ["background", 0, 90],
      ["actors", 90, 205],
      ["dialogue", 205, 270],
    ]) {
      let difference = 0;
      for (let i = start * 480 * 3; i < end * 480 * 3; i++)
        difference += Math.abs(left[i] - right[i]);
      const normalizedMeanError = difference / ((end - start) * 480 * 3 * 255);
      regions.push({ time, name, normalizedMeanError, threshold: 0.05 });
      assert.ok(
        normalizedMeanError <= 0.05,
        `Preview/export mismatch in ${name} at ${time}s: ${normalizedMeanError}`,
      );
    }
  }
  // Save the actual metrics before returning; keep evidence independent of the Markdown summary.
  const result = {
    file: path.relative(directory, file),
    video: {
      codec: video.codec_name,
      width: video.width,
      height: video.height,
      fps: video.avg_frame_rate,
      frames: Number(video.nb_read_frames),
      duration: Number(video.duration),
    },
    audio: {
      codec: audio.codec_name,
      duration: Number(audio.duration),
      ...best,
    },
    compiledDuration: compiled.duration,
    decoded: true,
    monotonicTimestamps: true,
    regions,
  };
  await writeFile(
    path.join(directory, "video-verification.json"),
    JSON.stringify(result, null, 2),
  );
  return result;
}
