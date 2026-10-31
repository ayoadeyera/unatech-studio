
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const { prepareScenes } = require("./prepareScenes");

async function renderMixedMediaVideo({
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

  if (timeline.gaps.length > 0) {
    throw new Error(
      "Timeline gaps are not supported yet."
    );
  }

  if (timeline.endTime > 300) {
    throw new Error("Maximum timeline duration is 300 seconds.");
  }

  // Media paths must be resolved from validated project
  // uploads by the backend, never directly from user input.
  for (const scene of timeline.scenes) {
    if (
      typeof scene.mediaPath !== "string" ||
      !scene.mediaPath
    ) {
      throw new Error(
        `Scene "${scene.title}" is missing its media path.`
      );
    }
  }

  await Promise.all([
    fs.access(audioPath),
    ...timeline.scenes.map((scene) =>
      fs.access(scene.mediaPath)
    ),
  ]);

  await fs.mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  const args = ["-hide_banner", "-y"];

  // Add images and video clips in timeline order.
  for (const scene of timeline.scenes) {
    if (scene.mediaType === "image") {
      args.push(
        "-loop", "1",
        "-framerate", "30",
        "-t", String(scene.duration),
        "-i", scene.mediaPath
      );
    } else {
      // Repeat a short video if its scene lasts longer.
      args.push(
        "-stream_loop", "-1",
        "-t", String(scene.duration),
        "-i", scene.mediaPath
      );
    }
  }

  // Narration is the final input.
  args.push("-i", audioPath);

  const filters = timeline.scenes.map((scene, index) => {
    return (
      `[${index}:v:0]` +
      "scale=1280:720:force_original_aspect_ratio=decrease," +
      "pad=1280:720:(ow-iw)/2:(oh-ih)/2," +
      "setsar=1," +
      "fps=30," +
      `trim=duration=${scene.duration},` +
      `setpts=PTS-STARTPTS,format=yuv420p[v${index}]`
    );
  });

  const videoInputs = timeline.scenes
    .map((_, index) => `[v${index}]`)
    .join("");

  filters.push(
    `${videoInputs}concat=n=${timeline.scenes.length}:v=1:a=0[vout]`
  );

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    "-map", `${timeline.scenes.length}:a:0`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-r", "30",
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
    let settled = false;

    function finish(error) {
      if (settled) return;
      settled = true;

      if (error) reject(error);
      else resolve();
    }

    ffmpeg.stderr.on("data", (data) => {
      errorOutput = (
        errorOutput + data.toString()
      ).slice(-8000);
    });

    ffmpeg.on("error", finish);

    ffmpeg.on("close", (code, signal) => {
      if (code === 0) {
        finish();
      } else {
        finish(
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

module.exports = { renderMixedMediaVideo };
