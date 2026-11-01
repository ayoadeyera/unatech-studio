
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { timeout: 15000, windowsHide: true },
      (error, stdout) => {
        if (error) return reject(error);

        const duration = Number(stdout.trim());

        if (!Number.isFinite(duration) || duration <= 0) {
          return reject(
            new Error("Unable to determine audio duration.")
          );
        }

        resolve(duration);
      }
    );
  });
}

async function insertTeachingPauses({
  audioPath,
  teachingPauses = [],
  outputPath,
}) {
  if (!audioPath || !outputPath) {
    throw new Error("Audio and output paths are required.");
  }

  if (!Array.isArray(teachingPauses)) {
    throw new Error("Teaching pauses must be an array.");
  }

  if (path.resolve(audioPath) === path.resolve(outputPath)) {
    throw new Error("Output must not overwrite original narration.");
  }

  const duration = await getAudioDuration(audioPath);

  const pauses = [...teachingPauses].sort(
    (a, b) => a.time - b.time
  );

  if (
    pauses.length > 50 ||
    pauses.some(
      (pause) =>
        !pause ||
        !Number.isFinite(pause.time) ||
        !Number.isFinite(pause.duration) ||
        pause.time < 0 ||
        pause.time > duration ||
        pause.duration <= 0 ||
        pause.duration > 30
    )
  ) {
    throw new Error("Invalid teaching pause positions or durations.");
  }

  // Build narration segments and silence segments.
  const pieces = [];
  let cursor = 0;

  for (const pause of pauses) {
    if (pause.time > cursor) {
      pieces.push({
        type: "audio",
        start: cursor,
        end: pause.time,
      });
    }

    pieces.push({
      type: "silence",
      duration: pause.duration,
    });

    cursor = pause.time;
  }

  if (cursor < duration) {
    pieces.push({
      type: "audio",
      start: cursor,
      end: duration,
    });
  }

  const audioPieces = pieces.filter(
    (piece) => piece.type === "audio"
  );

  const filters = [];
  const labels = [];
  const sourceLabels = audioPieces.map(
    (_, index) => `[source${index}]`
  );

  filters.push(
    "[0:a]aresample=48000," +
    "aformat=sample_fmts=fltp:channel_layouts=stereo," +
    `asplit=${audioPieces.length}` +
    sourceLabels.join("")
  );

  let audioIndex = 0;

  pieces.forEach((piece, index) => {
    const label = `part${index}`;

    if (piece.type === "audio") {
      filters.push(
        `[source${audioIndex}]` +
        `atrim=start=${piece.start}:end=${piece.end},` +
        `asetpts=PTS-STARTPTS[${label}]`
      );

      audioIndex++;
    } else {
      filters.push(
        "anullsrc=r=48000:cl=stereo," +
        `atrim=duration=${piece.duration},` +
        `asetpts=PTS-STARTPTS[${label}]`
      );
    }

    labels.push(`[${label}]`);
  });

  filters.push(
    labels.join("") +
    `concat=n=${labels.length}:v=0:a=1[aout]`
  );

  await fs.mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  const args = [
    "-hide_banner", "-y",
    "-i", audioPath,
    "-filter_complex", filters.join(";"),
    "-map", "[aout]",
    "-c:a", "pcm_s16le",
    outputPath,
  ];

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, {
      windowsHide: true,
      timeout: 300000,
    });

    let errors = "";

    ffmpeg.stderr.on("data", (data) => {
      errors = (errors + data.toString()).slice(-4000);
    });

    ffmpeg.on("error", reject);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(
          `FFmpeg audio processing failed.\n${errors}`
        ));
      }
    });
  });

  return {
    outputPath,
    originalDuration: duration,
    expectedDuration:
      duration +
      pauses.reduce((sum, pause) => sum + pause.duration, 0),
    pauseCount: pauses.length,
  };
}

module.exports = { insertTeachingPauses };
