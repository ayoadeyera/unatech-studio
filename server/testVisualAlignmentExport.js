const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { renderMixedMediaVideo } = require("./utils/renderMixedMediaVideo");

const execFileAsync = promisify(execFile);

async function run(command, args) {
  await execFileAsync(command, args, { windowsHide: true, timeout: 300000 });
}

async function main() {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "unatech-visual-export-"));
  try {
    const imagePath = path.join(temporaryDirectory, "still.png");
    const shortVideoPath = path.join(temporaryDirectory, "short.mp4");
    const audioPath = path.join(temporaryDirectory, "narration.wav");
    const outputPath = path.join(temporaryDirectory, "mixed-export.mp4");

    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=navy:s=320x180", "-frames:v", "1", imagePath]);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=6:duration=0.75", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", shortVideoPath]);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:a", "pcm_s16le", audioPath]);

    await renderMixedMediaVideo({
      audioPath,
      outputPath,
      scenes: [
        { id: "image", title: "Image segment", startTime: 0, duration: 1.5, mediaType: "image", mediaUrl: "/synthetic.png", mediaPath: imagePath },
        { id: "video", title: "Short video segment", startTime: 1.5, duration: 2.5, mediaType: "video", mediaUrl: "/synthetic.mp4", mediaPath: shortVideoPath },
      ],
    });

    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate",
      "-of", "json", outputPath,
    ], { windowsHide: true });
    const probe = JSON.parse(stdout);
    const streams = probe.streams;
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.find((stream) => stream.codec_type === "audio");
    const duration = Number(probe.format.duration);
    assert.ok(video, "export contains video");
    assert.ok(audio, "export contains narration audio");
    assert.equal(video.width, 1280);
    assert.equal(video.height, 720);
    assert.equal(video.r_frame_rate, "30/1");
    assert.ok(duration >= 3.9 && duration <= 4.2, `expected about 4 seconds, got ${duration}`);
    console.log(`PASS: mixed image + short looping video export with narration; ${duration.toFixed(3)}s, 1280x720 at 30 fps, audio/video streams present.`);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL: mixed-media visual alignment export", error);
  process.exitCode = 1;
});
