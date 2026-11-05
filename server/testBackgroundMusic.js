const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const {
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
} = require("./utils/backgroundMusic");
const { insertTeachingPauses } = require("./utils/insertTeachingPauses");
const { renderMixedMediaVideo } = require("./utils/renderMixedMediaVideo");

const execFileAsync = promisify(execFile);
async function run(command, args, options = {}) {
  return execFileAsync(command, args, { windowsHide: true, timeout: 300000, ...options });
}

async function probeDuration(filename) {
  return getAudioDuration(filename);
}

async function toneAmplitude(filename, time, frequency) {
  const { stdout } = await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-ss", String(time), "-t", "0.18",
    "-i", filename, "-f", "s16le", "-ac", "1", "-ar", "48000", "pipe:1",
  ], { encoding: "buffer", maxBuffer: 1024 * 1024 });
  const samples = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const angle = (2 * Math.PI * frequency * index) / 48000;
    real += samples[index] * Math.cos(angle);
    imaginary -= samples[index] * Math.sin(angle);
  }
  return (2 * Math.hypot(real, imaginary)) / samples.length / 32768;
}

async function main() {
  const validId = "eea2b650-0353-4a52-a09c-3aa1e186030a";
  assert.equal(isValidProjectId(validId), true);
  assert.equal(isValidProjectId("../../uploads"), false);
  assert.equal(getBackgroundMusicExtension("theme.mp3", "audio/mpeg"), ".mp3");
  assert.equal(getBackgroundMusicExtension("theme.wav", "audio/wav"), ".wav");
  assert.equal(getBackgroundMusicExtension("theme.mp3", "image/png"), null);
  assert.equal(getBackgroundMusicExtension("theme.wav", "audio/mpeg"), null);
  const storedFilename = createStoredMusicFilename("Quiet Theme.wav", "audio/wav");
  assert.match(storedFilename, MUSIC_FILENAME_PATTERN);
  assert.equal(MAX_BACKGROUND_MUSIC_SIZE, 100 * 1024 * 1024);
  assert.deepEqual(normalizeBackgroundMusicSettings(), DEFAULT_BACKGROUND_MUSIC_SETTINGS);
  assert.throws(() => normalizeBackgroundMusicSettings({ musicVolume: 1.2 }), /between 0 and 1/);
  assert.throws(() => normalizeBackgroundMusicSettings({ fadeInDuration: -1 }), /between 0 and 10/);

  const pauses = [{ time: 2, duration: 1 }, { time: 4, duration: 0.5 }];
  const settings = {
    musicVolume: 0.5,
    narrationDuckingLevel: 0.2,
    teachingPauseMusicLevel: 0.8,
    fadeInDuration: 0.1,
    fadeOutDuration: 0.2,
    transitionDuration: 0.2,
  };
  const expression = buildPauseAwareVolumeExpression(
    [{ startTime: 2, duration: 1 }, { startTime: 5, duration: 0.5 }],
    settings,
  );
  assert.match(expression, /0\.4/);
  assert.match(expression, /0\.1/);
  assert.match(expression, /lt\(t\\,2\.2\)/);

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "unatech-background-music-"));
  try {
    const narration = path.join(temporaryDirectory, "narration.wav");
    const music = path.join(temporaryDirectory, "short-loop.wav");
    const pausedNarration = path.join(temporaryDirectory, "paused-narration.wav");
    const mixedAudio = path.join(temporaryDirectory, "music-mix.wav");
    const image = path.join(temporaryDirectory, "visual.png");
    const exportPath = path.join(temporaryDirectory, "background-music-export.mp4");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6", "-af", "volume=6.4", "-c:a", "pcm_s16le", narration]);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=0.5", "-af", "volume=6.4", "-c:a", "pcm_s16le", music]);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=navy:s=320x180", "-frames:v", "1", image]);
    const sourceHashes = await Promise.all([narration, music].map(async (file) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex")));

    const inserted = await insertTeachingPauses({
      audioPath: narration,
      teachingPauses: pauses,
      outputPath: pausedNarration,
    });
    assert.equal(inserted.expectedDuration, 7.5);
    const result = await mixBackgroundMusic({
      audioPath: pausedNarration,
      musicPath: music,
      outputPath: mixedAudio,
      teachingPauses: pauses,
      settings,
    });
    assert.ok(Math.abs(result.duration - 7.5) < 0.02, "mixed audio follows pause-adjusted narration duration");
    assert.ok(Math.abs((await probeDuration(mixedAudio)) - 7.5) < 0.03, "music loops/trims to narration duration");

    const speechMusicLevel = await toneAmplitude(mixedAudio, 1, 1000);
    const pauseMusicLevel = await toneAmplitude(mixedAudio, 2.5, 1000);
    assert.ok(pauseMusicLevel > speechMusicLevel * 2.5, `pause music should rise smoothly over speech (${pauseMusicLevel} vs ${speechMusicLevel})`);

    const limitedAudio = path.join(temporaryDirectory, "limited-mix.wav");
    await mixBackgroundMusic({
      audioPath: narration,
      musicPath: music,
      outputPath: limitedAudio,
      settings: {
        musicVolume: 1,
        narrationDuckingLevel: 0.8,
        teachingPauseMusicLevel: 0.8,
        fadeInDuration: 0,
        fadeOutDuration: 0,
        transitionDuration: 0,
      },
    });
    const { stderr: peakReport } = await run("ffmpeg", ["-hide_banner", "-i", limitedAudio, "-af", "volumedetect", "-f", "null", "NUL"]);
    const peak = Number(peakReport.match(/max_volume:\s*(-?[0-9.]+) dB/)?.[1]);
    assert.ok(Number.isFinite(peak) && peak <= -0.3, `limiter keeps mixed peaks below clipping (${peak} dBFS)`);

    const hashesAfter = await Promise.all([narration, music].map(async (file) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex")));
    assert.deepEqual(hashesAfter, sourceHashes, "uploaded narration and music sources remain unchanged");

    await renderMixedMediaVideo({
      audioPath: mixedAudio,
      outputPath: exportPath,
      scenes: [
        { id: "still", title: "Teaching still", startTime: 0, duration: 3.5, mediaType: "image", mediaUrl: "/still.png", mediaPath: image },
        { id: "still-2", title: "Teaching still 2", startTime: 3.5, duration: 4, mediaType: "image", mediaUrl: "/still.png", mediaPath: image },
      ],
    });
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name", "-of", "json", exportPath]);
    const probe = JSON.parse(stdout);
    assert.ok(probe.streams.some((stream) => stream.codec_type === "audio" && stream.codec_name === "aac"));
    assert.ok(probe.streams.some((stream) => stream.codec_type === "video" && stream.codec_name === "h264"));
    assert.ok(Math.abs(Number(probe.format.duration) - 7.5) < 0.1, "MP4 keeps pause-extended narration duration");

    console.log(`PASS: project/file/settings validation; short music loop; pause-aware ramps; limiter peak ${peak.toFixed(2)} dBFS; ${result.duration.toFixed(2)}s mixed audio and H.264/AAC MP4; source audio preserved.`);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL: background music processing", error);
  process.exitCode = 1;
});
