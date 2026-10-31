
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const { prepareScenes } = require("./prepareScenes");

async function renderMultiImageVideo({
  scenes,
  audioPath,
  outputPath,
}) {
  if (!audioPath || !outputPath) {
    throw new Error("Audio and output paths are required.");
  }

  const timeline = prepareScenes(scenes);

  if (timeline.scenes.length > 20) {
    throw new Error("Maximum 20 scenes per render.");
  }

  if (timeline.scenes.some((scene) => scene.mediaType !== "image")) {
    throw new Error("This renderer supports images only.");
  }

  if (timeline.gaps.length > 0) {
    throw new Error(
      "Timeline gaps are not supported yet. Scenes must be continuous."
    );
  }

  // mediaPath must be resolved and validated by the server.
  const imagePaths = timeline.scenes.map((scene) => {
    if (!scene.mediaPath) {
      throw new Error("A scene is missing its media path.");
    }
    return scene.mediaPath;
  });

  await Promise.all([
    fs.access(audioPath),
    ...imagePaths.map((file) => fs.access(file)),
  ]);

  await fs.mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  const args = ["-hide_banner", "-y"];

  // Add every image as a timed FFmpeg input.
  timeline.scenes.forEach((scene, index) => {
    args.push(
      "-loop", "1",
      "-framerate", "30",
      "-t", String(scene.duration),
      "-i", imagePaths[index]
    );
  });

  // Narration is the final input.
  args.push("-i", audioPath);

  const filters = [];

  timeline.scenes.forEach((scene, index) => {
    filters.push(
      `[${index}:v]` +
      "scale=1280:720:force_original_aspect_ratio=decrease," +
      "pad=1280:720:(ow-iw)/2:(oh-ih)/2," +
      "setsar=1," +
      "fps=30," +
      `trim=duration=${scene.duration},` +
      `setpts=PTS-STARTPTS,format=yuv420p[v${index}]`
    );
  });

  const inputs = timeline.scenes
    .map((_, index) => `[v${index}]`)
    .join("");

  filters.push(
    `${inputs}concat=n=${timeline.scenes.length}:v=1:a=0[vout]`
  );

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    "-map", `${timeline.scenes.length}:a:0`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    outputPath
  );

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, {
      windowsHide: true,
      timeout: 300000,
    });

    let errorOutput = "";

    ffmpeg.stderr.on("data", (data) => {
      errorOutput = (errorOutput + data.toString()).slice(-8000);
    });

    ffmpeg.on("error", reject);

    ffmpeg.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg failed (${signal || code}).\n${errorOutput}`
          )
        );
      }
    });
  });

  const output = await fs.stat(outputPath);

  if (output.size === 0) {
    throw new Error("FFmpeg produced an empty video.");
  }

  return {
    outputPath,
    filename: path.basename(outputPath),
    size: output.size,
    sceneCount: timeline.scenes.length,
  };
}

module.exports = { renderMultiImageVideo };
