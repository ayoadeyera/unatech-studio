const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_BACKGROUND_MUSIC_SIZE = 100 * 1024 * 1024;
const DEFAULT_BACKGROUND_MUSIC_SETTINGS = Object.freeze({
  musicVolume: 0.24,
  narrationDuckingLevel: 0.35,
  teachingPauseMusicLevel: 0.75,
  fadeInDuration: 1.25,
  fadeOutDuration: 1.75,
  transitionDuration: 0.8,
});

const MUSIC_TYPES = Object.freeze({
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/vnd.wave": ".wav",
});
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MUSIC_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:-[a-z0-9_-]{1,48})?\.(?:mp3|wav)$/i;

function isValidProjectId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function getBackgroundMusicExtension(originalName, mimetype) {
  const extension = MUSIC_TYPES[mimetype];
  if (!extension || path.extname(String(originalName)).toLowerCase() !== extension) {
    return null;
  }
  return extension;
}

function createStoredMusicFilename(originalName, mimetype) {
  const extension = getBackgroundMusicExtension(originalName, mimetype);
  if (!extension) throw new Error("Only MP3 and WAV background music files are supported.");
  const base = path.basename(String(originalName), extension)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "background-music";
  return `${require("node:crypto").randomUUID()}-${base}${extension}`;
}

function normalizeBackgroundMusicSettings(settings = {}) {
  const normalized = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_BACKGROUND_MUSIC_SETTINGS)) {
    const value = settings[key] === undefined ? defaultValue : settings[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Invalid background music setting: ${key}.`);
    }
    const maximum = key.endsWith("Duration") ? 10 : 1;
    if (value < 0 || value > maximum) {
      throw new Error(`Background music setting ${key} must be between 0 and ${maximum}.`);
    }
    normalized[key] = value;
  }
  return normalized;
}

function formatNumber(value) {
  return Number(value.toFixed(6)).toString();
}

function buildPauseAwareVolumeExpression(teachingPauses, settings) {
  const duckLevel = settings.musicVolume * settings.narrationDuckingLevel;
  const pauseLevel = settings.musicVolume * settings.teachingPauseMusicLevel;
  let expression = formatNumber(duckLevel);
  const ordered = [...teachingPauses].sort((a, b) => a.startTime - b.startTime);

  for (const pause of ordered.reverse()) {
    const ramp = Math.min(settings.transitionDuration, pause.duration / 2);
    const start = formatNumber(pause.startTime);
    const end = formatNumber(pause.startTime + pause.duration);
    const rampInEnd = formatNumber(pause.startTime + ramp);
    const rampOutStart = formatNumber(pause.startTime + pause.duration - ramp);
    const baseline = formatNumber(duckLevel);
    const duringPause = formatNumber(pauseLevel);
    if (ramp <= 0) {
      expression = `if(between(t,${start},${end}),${duringPause},${expression})`;
      continue;
    }
    expression =
      `if(lt(t,${start}),${expression},` +
      `if(lt(t,${rampInEnd}),${baseline}+(${duringPause}-${baseline})*(t-${start})/${formatNumber(ramp)},` +
      `if(lt(t,${rampOutStart}),${duringPause},` +
      `if(lt(t,${end}),${duringPause}+(${baseline}-${duringPause})*(t-${rampOutStart})/${formatNumber(ramp)},${expression}))))`;
  }
  return expression.replace(/,/g, "\\,");
}

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    execFile("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", filePath,
    ], { timeout: 15000, windowsHide: true }, (error, stdout) => {
      if (error) return reject(error);
      const duration = Number(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        return reject(new Error("Unable to determine audio duration."));
      }
      resolve(duration);
    });
  });
}

async function mixBackgroundMusic({ audioPath, musicPath, outputPath, teachingPauses = [], settings = {} }) {
  if (!audioPath || !musicPath || !outputPath) throw new Error("Narration, music, and output paths are required.");
  const resolvedOutput = path.resolve(outputPath);
  if (resolvedOutput === path.resolve(audioPath) || resolvedOutput === path.resolve(musicPath)) {
    throw new Error("Mixed audio output must not overwrite uploaded source audio.");
  }
  const normalizedSettings = normalizeBackgroundMusicSettings(settings);
  if (!Array.isArray(teachingPauses) || teachingPauses.length > 50) throw new Error("Invalid teaching pause data.");
  let elapsedPauseTime = 0;
  const mappedPauses = [...teachingPauses].sort((a, b) => a.time - b.time).map((pause, index, pauses) => {
    if (!pause || !Number.isFinite(pause.time) || !Number.isFinite(pause.duration) || pause.time < 0 || pause.duration <= 0 || pause.duration > 30) {
      throw new Error("Invalid teaching pause positions or durations.");
    }
    if (index > 0 && pause.time < pauses[index - 1].time) throw new Error("Teaching pauses must be ordered.");
    const mapped = { startTime: pause.time + elapsedPauseTime, duration: pause.duration };
    elapsedPauseTime += pause.duration;
    return mapped;
  });

  const duration = await getAudioDuration(audioPath);
  if (duration > 300) throw new Error("Background music exports support timelines up to 300 seconds.");
  if (mappedPauses.some((pause) => pause.startTime + pause.duration > duration + 0.05)) {
    throw new Error("Teaching pause timing exceeds the processed narration duration.");
  }
  await Promise.all([fs.access(audioPath), fs.access(musicPath)]);
  if (path.resolve(outputPath) === path.resolve(musicPath)) throw new Error("Mixed audio output must not overwrite uploaded source music.");

  const fadeIn = Math.min(normalizedSettings.fadeInDuration, duration / 2);
  const fadeOut = Math.min(normalizedSettings.fadeOutDuration, duration - fadeIn);
  const filters = [
    "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[narration]",
    `[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=${formatNumber(duration)},asetpts=PTS-STARTPTS` +
      (fadeIn > 0 ? `,afade=t=in:st=0:d=${formatNumber(fadeIn)}` : "") +
      (fadeOut > 0 ? `,afade=t=out:st=${formatNumber(Math.max(0, duration - fadeOut))}:d=${formatNumber(fadeOut)}` : "") +
      `,volume='${buildPauseAwareVolumeExpression(mappedPauses, normalizedSettings)}':eval=frame[music]`,
    "[narration][music]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95:attack=5:release=50:level=false,aresample=48000[aout]",
  ];
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const args = [
    "-hide_banner", "-y", "-i", audioPath,
    "-stream_loop", "-1", "-i", musicPath,
    "-filter_complex", filters.join(";"), "-map", "[aout]",
    "-t", formatNumber(duration), "-c:a", "pcm_s16le", outputPath,
  ];
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, { windowsHide: true, timeout: 300000 });
    let errors = "";
    ffmpeg.stderr.on("data", (data) => { errors = (errors + data.toString()).slice(-8000); });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code, signal) => code === 0
      ? resolve()
      : reject(new Error(`FFmpeg background music mix failed (${signal || code}).\n${errors}`)));
  });
  const stat = await fs.stat(outputPath);
  if (stat.size === 0) throw new Error("FFmpeg produced an empty mixed audio file.");
  return { outputPath, duration, settings: normalizedSettings, pauseCount: mappedPauses.length };
}

module.exports = {
  DEFAULT_BACKGROUND_MUSIC_SETTINGS,
  MAX_BACKGROUND_MUSIC_SIZE,
  MUSIC_FILENAME_PATTERN,
  buildPauseAwareVolumeExpression,
  createStoredMusicFilename,
  getAudioDuration,
  getBackgroundMusicExtension,
  isValidProjectId,
  mixBackgroundMusic,
  normalizeBackgroundMusicSettings,
};
