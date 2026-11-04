const { execFile } = require("node:child_process");

const DEFAULT_NOISE_DB = -35;
const DEFAULT_MIN_SILENCE_SECONDS = 0.35;
const SPEECH_EDGE_PADDING = 0.06;
const MIN_SEGMENT_SECONDS = 0.12;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout: options.timeout ?? 120000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          return reject(error);
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function parseSilenceIntervals(stderr, duration) {
  const intervals = [];
  const silencePattern = /silence_start:\s*(-?\d+(?:\.\d+)?)/g;
  let match;

  while ((match = silencePattern.exec(stderr)) !== null) {
    const start = Math.max(0, Number(match[1]));
    const afterStart = stderr.slice(silencePattern.lastIndex);
    const endMatch = /silence_end:\s*(-?\d+(?:\.\d+)?)/.exec(afterStart);
    const end = endMatch
      ? Math.min(duration, Math.max(start, Number(endMatch[1])))
      : duration;

    intervals.push({ start, end });
    if (endMatch) silencePattern.lastIndex += endMatch.index + endMatch[0].length;
  }

  return intervals;
}

function buildSpeechActivitySegments(silenceIntervals, duration) {
  const segments = [];
  let cursor = 0;

  for (const silence of silenceIntervals) {
    const padding = Math.min(SPEECH_EDGE_PADDING, Math.max(0, (silence.end - silence.start) / 2));
    const segmentEnd = Math.min(duration, silence.start + padding);
    if (segmentEnd - cursor >= MIN_SEGMENT_SECONDS) {
      segments.push({
        startTime: Number(cursor.toFixed(3)),
        endTime: Number(segmentEnd.toFixed(3)),
        duration: Number((segmentEnd - cursor).toFixed(3)),
      });
    }

    cursor = Math.max(cursor, Math.min(duration, silence.end - padding));
  }

  if (duration - cursor >= MIN_SEGMENT_SECONDS) {
    segments.push({
      startTime: Number(cursor.toFixed(3)),
      endTime: Number(duration.toFixed(3)),
      duration: Number((duration - cursor).toFixed(3)),
    });
  }

  return segments;
}

async function detectNarrationSegments(audioPath, options = {}) {
  const noiseDb = options.noiseDb ?? DEFAULT_NOISE_DB;
  const minSilenceSeconds = options.minSilenceSeconds ?? DEFAULT_MIN_SILENCE_SECONDS;

  if (!Number.isFinite(noiseDb) || noiseDb < -80 || noiseDb > -10) {
    throw new Error("Noise threshold must be between -80 and -10 dB.");
  }
  if (!Number.isFinite(minSilenceSeconds) || minSilenceSeconds < 0.1 || minSilenceSeconds > 5) {
    throw new Error("Minimum silence duration must be between 0.1 and 5 seconds.");
  }

  const probe = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath,
  ]);
  const duration = Number.parseFloat(probe.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read a valid narration duration.");
  }

  const detection = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", audioPath,
    "-af", `silencedetect=noise=${noiseDb}dB:d=${minSilenceSeconds}`,
    "-f", "null", "-",
  ]);
  const silences = parseSilenceIntervals(detection.stderr, duration);
  const segments = buildSpeechActivitySegments(silences, duration);

  return {
    duration: Number(duration.toFixed(3)),
    segments,
    parameters: { noiseDb, minSilenceSeconds, edgePaddingSeconds: SPEECH_EDGE_PADDING },
  };
}

module.exports = {
  detectNarrationSegments,
  parseSilenceIntervals,
  buildSpeechActivitySegments,
};
