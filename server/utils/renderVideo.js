
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

/**
 * Creates an MP4 video from one image and narration audio.
 *
 * All paths must come from validated, server-controlled files.
 */
async function renderImageVideo({
  imagePath,
  audioPath,
  outputPath,
}) {
  if (!imagePath || !audioPath || !outputPath) {
    throw new Error("Image, audio and output paths are required.");
  }

  // Confirm both input files exist.
  await Promise.all([
    fs.access(imagePath),
    fs.access(audioPath),
  ]);

  // Create the output directory if necessary.
  await fs.mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  const args = [
    "-hide_banner",
    "-y",

    // Repeat the image throughout the narration.
    "-loop", "1",
    "-framerate", "30",
    "-i", imagePath,

    // Narration audio.
    "-i", audioPath,

    // Select the image and narration streams.
    "-map", "0:v:0",
    "-map", "1:a:0",

    // Fit the image into a 1280x720 canvas.
    "-vf",
    "scale=1280:720:force_original_aspect_ratio=decrease," +
      "pad=1280:720:(ow-iw)/2:(oh-ih)/2," +
      "setsar=1,format=yuv420p",

    // Encode video and audio.
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-r", "30",
    "-c:a", "aac",
    "-b:a", "192k",

    // Stop when narration ends.
    "-shortest",

    // Optimize MP4 for web playback.
    "-movflags", "+faststart",

    outputPath,
  ];

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, {
      windowsHide: true,
      timeout: 300000,
    });

    let errorOutput = "";
    let settled = false;

    function fail(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    ffmpeg.stderr.on("data", (data) => {
      errorOutput = (errorOutput + data.toString()).slice(-8000);
    });

    ffmpeg.on("error", fail);

    ffmpeg.on("close", (code, signal) => {
      if (settled) return;

      if (code === 0) {
        settled = true;
        resolve();
      } else {
        fail(
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
  };
}

module.exports = {
  renderImageVideo,
};
