const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { renderMixedMediaVideo } = require("./utils/renderMixedMediaVideo");

const execFileAsync = promisify(execFile);
async function run(command, args, options = {}) {
  return execFileAsync(command, args, { windowsHide: true, timeout: 300000, maxBuffer: 2 * 1024 * 1024, ...options });
}

async function framePixels(filename, time) {
  const { stdout } = await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", filename, "-ss", String(time),
    "-map", "0:v:0", "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1",
  ], { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 });
  return stdout;
}

function meanAbsoluteFrameDifference(first, second) {
  assert.equal(first.length, second.length);
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference += Math.abs(first[index] - second[index]);
  return difference / first.length;
}

async function main() {
  const directory = await fs.mkdtemp(path.join(__dirname, ".video-freeze-test-"));
  try {
    const sourceVideo = path.join(directory, "source.mp4");
    const audioPath = path.join(directory, "narration.wav");
    const outputPath = path.join(directory, "freeze-resume.mp4");
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
      "-i", "testsrc2=size=320x180:rate=30:duration=16", "-an",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", sourceVideo,
    ]);
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
      "-i", "sine=frequency=440:duration=18", "-c:a", "pcm_s16le", audioPath,
    ]);
    await renderMixedMediaVideo({
      scenes: [
        { id: "play", title: "Video plays", startTime: 0, duration: 10, mediaType: "video", mediaUrl: "/video.mp4", mediaPath: sourceVideo, sourceOffset: 0, isTeachingPause: false },
        { id: "pause", title: "Frozen frame", startTime: 10, duration: 3, mediaType: "video", mediaUrl: "/video.mp4", mediaPath: sourceVideo, sourceOffset: 10, isTeachingPause: true },
        { id: "resume", title: "Video resumes", startTime: 13, duration: 5, mediaType: "video", mediaUrl: "/video.mp4", mediaPath: sourceVideo, sourceOffset: 10, isTeachingPause: false },
      ],
      audioPath,
      outputPath,
    });
    const heldFrameChange = meanAbsoluteFrameDifference(await framePixels(outputPath, 10.5), await framePixels(outputPath, 12.5));
    const resumedMotion = meanAbsoluteFrameDifference(await framePixels(outputPath, 13.5), await framePixels(outputPath, 14.5));
    assert.ok(heldFrameChange < 1, `teaching pause should visually hold one frame (mean pixel change ${heldFrameChange})`);
    assert.ok(resumedMotion > 5, `video motion should resume after the pause (mean pixel change ${resumedMotion})`);
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", outputPath]);
    const probe = JSON.parse(stdout);
    assert.ok(probe.streams.some((stream) => stream.codec_type === "audio"));
    assert.ok(probe.streams.some((stream) => stream.codec_type === "video"));
    assert.ok(Math.abs(Number(probe.format.duration) - 18) < 0.1);
    console.log(`PASS: synthetic video holds a visually stable frame during teaching pause (mean change ${heldFrameChange.toFixed(3)}), resumes motion (${resumedMotion.toFixed(2)}), and stays with narration (18.00s export).`);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL: video teaching-pause freeze/resume", error);
  process.exitCode = 1;
});
