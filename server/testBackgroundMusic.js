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

async function toneAmplitude(filename, time, frequency, duration = 0.18) {
  const { stdout } = await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", filename,
    "-af", `atrim=start=${time}:duration=${duration},asetpts=PTS-STARTPTS`,
    "-vn", "-f", "s16le", "-ac", "1", "-ar", "48000", "pipe:1",
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

function evaluateVolumeExpression(expression, time) {
  const javascriptExpression = expression.replace(/\\,/g, ",");
  return Function("t", "min", "max", "cos", "PI", `return (${javascriptExpression});`)(
    time, Math.min, Math.max, Math.cos, Math.PI,
  );
}

async function renderFloatSignal(filterChain) {
  const { stdout } = await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "aevalsrc=0.5:s=48000:d=2",
    "-af", `${filterChain},aformat=sample_fmts=flt`, "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
  ], { encoding: "buffer", maxBuffer: 2 * 1024 * 1024 });
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 4));
}

async function measureMaximumGainStep(filterChain) {
  const samples = await renderFloatSignal(filterChain);
  let maximumStep = 0;
  for (let index = 1; index < samples.length; index += 1) {
    maximumStep = Math.max(maximumStep, Math.abs(samples[index] - samples[index - 1]));
  }
  return { maximumStep, sampleCount: samples.length };
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
  assert.deepEqual(DEFAULT_BACKGROUND_MUSIC_SETTINGS, {
    musicVolume: 0.2,
    narrationDuckingLevel: 0.3,
    teachingPauseMusicLevel: 0.55,
    fadeInDuration: 0.8,
    fadeOutDuration: 1,
    transitionDuration: 0.6,
  });
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
  const pauseSet = (count) => Array.from({ length: count }, (_, index) => ({
    startTime: 0.2 + index * 0.15,
    duration: 0.08,
  }));
  const expression2 = buildPauseAwareVolumeExpression(pauseSet(2), settings);
  const expression10 = buildPauseAwareVolumeExpression(pauseSet(10), settings);
  const expression50 = buildPauseAwareVolumeExpression(pauseSet(50), settings);
  assert.match(expression2, /0\.4/);
  assert.match(expression2, /0\.1/);
  assert.match(expression2, /min\(max\(/);
  assert.match(expression2, /cos\(PI\*/, "pause envelope uses a smooth half-cosine");
  assert.ok(!expression2.includes("(t-2)/0.2"), "pause expression no longer uses a linear ramp");
  assert.ok(expression10.length > expression2.length);
  assert.ok(expression50.length > expression10.length);
  assert.ok(expression50.length < expression10.length * 6, "expression size grows linearly across 50 pauses");
  assert.ok(expression50.length < 12_000, "50-pause volume expression stays bounded");
  const longPauseExpression = buildPauseAwareVolumeExpression([{ startTime: 2, duration: 1 }], settings);
  const shortPauseExpression = buildPauseAwareVolumeExpression([{ startTime: 2, duration: 0.1 }], { ...settings, transitionDuration: 0.5 });
  const duckedMusicLevel = settings.musicVolume * settings.narrationDuckingLevel;
  const longPausePeak = evaluateVolumeExpression(longPauseExpression, 2.1);
  const shortPausePeak = evaluateVolumeExpression(shortPauseExpression, 2.05);
  assert.ok(Math.abs(evaluateVolumeExpression(longPauseExpression, 2) - duckedMusicLevel) < 1e-9, "long pause starts at the ducked level");
  assert.ok(Math.abs(evaluateVolumeExpression(longPauseExpression, 3) - duckedMusicLevel) < 1e-9, "long pause returns to the ducked level at speech resume");
  assert.ok(longPausePeak > duckedMusicLevel, "long pause reaches its configured smooth lift");
  assert.ok(Math.abs(evaluateVolumeExpression(shortPauseExpression, 2) - duckedMusicLevel) < 1e-9, "short pause starts at the ducked level");
  assert.ok(Math.abs(evaluateVolumeExpression(shortPauseExpression, 2.1) - duckedMusicLevel) < 1e-9, "short pause returns to the ducked level at speech resume");
  assert.ok(shortPausePeak > duckedMusicLevel && shortPausePeak < longPausePeak, "short pause receives a reduced peak because its ramps cannot complete naturally");
  const steppingExpression = buildPauseAwareVolumeExpression([{ startTime: 0.5, duration: 1 }], {
    ...settings,
    transitionDuration: 0.6,
  });
  const frameEvaluated = await measureMaximumGainStep(`volume='${steppingExpression}':eval=frame`);
  const fineFrameEvaluated = await measureMaximumGainStep(`asetnsamples=n=128:p=0,volume='${steppingExpression}':eval=frame`);
  assert.equal(frameEvaluated.sampleCount, 96_000, "frame stepping reference covers the complete two-second signal");
  assert.equal(fineFrameEvaluated.sampleCount, frameEvaluated.sampleCount, "fine frame partition preserves audio duration");
  assert.ok(frameEvaluated.maximumStep > 0.005, `standard FFmpeg audio frames reproduce measurable gain stepping (${frameEvaluated.maximumStep})`);
  assert.ok(fineFrameEvaluated.maximumStep < 0.003, `128-sample frames smooth gain updates (${fineFrameEvaluated.maximumStep})`);
  assert.ok(frameEvaluated.maximumStep > fineFrameEvaluated.maximumStep * 3.5, "fine frame updates materially reduce envelope stepping");
  const fadeSamples = await renderFloatSignal("afade=curve=hsin:t=in:st=0:d=1,afade=curve=hsin:t=out:st=1:d=1");
  const fadeLevelAt = (time) => fadeSamples[Math.min(fadeSamples.length - 1, Math.round(time * 48_000))] / 0.5;
  for (const [time, expected] of [[0, 0], [0.25, 0.1464], [0.5, 0.5], [0.75, 0.8536], [1, 1], [1.25, 0.8536], [1.5, 0.5], [1.75, 0.1464], [2, 0]]) {
    assert.ok(Math.abs(fadeLevelAt(time) - expected) < 0.002, `hsin fade curve has the expected gain at ${time}s`);
  }

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "unatech-background-music-"));
  try {
    const narration = path.join(temporaryDirectory, "narration.wav");
    const music = path.join(temporaryDirectory, "short-loop.wav");
    const pausedNarration = path.join(temporaryDirectory, "paused-narration.wav");
    const mixedAudio = path.join(temporaryDirectory, "music-mix.wav");
    const image = path.join(temporaryDirectory, "visual.png");
    const exportPath = path.join(temporaryDirectory, "background-music-export.mp4");
    const noMusicExportPath = path.join(temporaryDirectory, "narration-only-export.mp4");
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

    const speechMusicLevel = await toneAmplitude(mixedAudio, 1, 1000, 0.05);
    const pauseMusicLevel = await toneAmplitude(mixedAudio, 2.5, 1000);
    assert.ok(pauseMusicLevel > speechMusicLevel * 2.5, `pause music should rise smoothly over speech (${pauseMusicLevel} vs ${speechMusicLevel})`);
    const pauseStartMusicLevel = await toneAmplitude(mixedAudio, 2, 1000, 0.04);
    const pauseResumeMusicLevel = await toneAmplitude(mixedAudio, 3, 1000, 0.04);
    assert.ok(pauseStartMusicLevel <= speechMusicLevel * 1.25, `pause boost eases in from the ducked level (${pauseStartMusicLevel} vs ${speechMusicLevel})`);
    assert.ok(pauseResumeMusicLevel <= speechMusicLevel * 1.25, `music returns to ducking as speech resumes (${pauseResumeMusicLevel} vs ${speechMusicLevel})`);
    const fadeInEdge = await toneAmplitude(mixedAudio, 0.02, 1000, 0.04);
    const fadeInSteady = await toneAmplitude(mixedAudio, 0.4, 1000, 0.08);
    const fadeOutEdge = await toneAmplitude(mixedAudio, 7.42, 1000, 0.04);
    const fadeOutSteady = await toneAmplitude(mixedAudio, 7, 1000, 0.08);
    assert.ok(fadeInEdge < fadeInSteady * 0.5, `smooth fade-in starts near silence (${fadeInEdge} vs ${fadeInSteady})`);
    assert.ok(fadeOutEdge < fadeOutSteady * 0.5, `smooth fade-out reaches silence at the end (${fadeOutEdge} vs ${fadeOutSteady})`);
    const narrationBeforeMix = await toneAmplitude(pausedNarration, 1, 440);
    const narrationAfterMix = await toneAmplitude(mixedAudio, 1, 440);
    assert.ok(narrationAfterMix >= narrationBeforeMix * 0.9, `amix keeps narration gain clear under music (${narrationAfterMix} vs ${narrationBeforeMix})`);

    const controlAPath = path.join(temporaryDirectory, "controls-no-duck.wav");
    const controlBPath = path.join(temporaryDirectory, "controls-strong-duck.wav");
    const controlASettings = { ...DEFAULT_BACKGROUND_MUSIC_SETTINGS, musicVolume: 0.6, narrationDuckingLevel: 1, teachingPauseMusicLevel: 1 };
    const controlBSettings = { ...controlASettings, narrationDuckingLevel: 0.1 };
    assert.deepEqual(normalizeBackgroundMusicSettings(controlASettings), controlASettings, "saved control values survive server settings normalization");
    assert.deepEqual(normalizeBackgroundMusicSettings(controlBSettings), controlBSettings, "low ducking value survives server settings normalization");
    await Promise.all([
      mixBackgroundMusic({ audioPath: pausedNarration, musicPath: music, outputPath: controlAPath, teachingPauses: pauses, settings: controlASettings }),
      mixBackgroundMusic({ audioPath: pausedNarration, musicPath: music, outputPath: controlBPath, teachingPauses: pauses, settings: controlBSettings }),
    ]);
    const controlLevels = {
      speechA: await toneAmplitude(controlAPath, 1, 1000, 0.1),
      speechB: await toneAmplitude(controlBPath, 1, 1000, 0.1),
      pauseA: await toneAmplitude(controlAPath, 2.5, 1000, 0.1),
      pauseB: await toneAmplitude(controlBPath, 2.5, 1000, 0.1),
      voiceA: await toneAmplitude(controlAPath, 1, 440, 0.1),
      voiceB: await toneAmplitude(controlBPath, 1, 440, 0.1),
    };
    assert.ok(controlLevels.speechA > controlLevels.speechB * 5, `narration ducking setting changes music by a large measurable amount (${controlLevels.speechA} vs ${controlLevels.speechB})`);
    const speechMusicRatio = controlLevels.speechA / controlLevels.speechB;
    const pauseMusicRatio = controlLevels.pauseA / controlLevels.pauseB;
    assert.ok(speechMusicRatio > 9.5 && speechMusicRatio < 10.5, `ducking slider applies its tenfold speech gain change (${speechMusicRatio})`);
    assert.ok(pauseMusicRatio > 1.1 && pauseMusicRatio < 1.3, `same pause target differs only by the short-pause envelope ramp (${pauseMusicRatio})`);
    assert.ok(controlLevels.pauseB > controlLevels.speechB * 5, "pause music clearly rises above the ducked speech level");

    const musicVolumeLowPath = path.join(temporaryDirectory, "music-volume-low.wav");
    const musicVolumeHighPath = path.join(temporaryDirectory, "music-volume-high.wav");
    const independentBase = { ...DEFAULT_BACKGROUND_MUSIC_SETTINGS, narrationDuckingLevel: 0.1, teachingPauseMusicLevel: 1 };
    await Promise.all([
      mixBackgroundMusic({ audioPath: pausedNarration, musicPath: music, outputPath: musicVolumeLowPath, teachingPauses: pauses, settings: { ...independentBase, musicVolume: 0.3 } }),
      mixBackgroundMusic({ audioPath: pausedNarration, musicPath: music, outputPath: musicVolumeHighPath, teachingPauses: pauses, settings: { ...independentBase, musicVolume: 0.6 } }),
    ]);
    const musicVolumeSpeechRatio = (await toneAmplitude(musicVolumeHighPath, 1, 1000, 0.1)) / (await toneAmplitude(musicVolumeLowPath, 1, 1000, 0.1));
    const musicVolumePauseRatio = (await toneAmplitude(musicVolumeHighPath, 2.5, 1000, 0.1)) / (await toneAmplitude(musicVolumeLowPath, 2.5, 1000, 0.1));
    assert.ok(Math.abs(musicVolumeSpeechRatio - 2) < 0.1, `music volume slider scales speech-bed level linearly (${musicVolumeSpeechRatio})`);
    assert.ok(Math.abs(musicVolumePauseRatio - 2) < 0.1, `music volume slider scales pause-bed level linearly (${musicVolumePauseRatio})`);

    const pauseLevelLowPath = path.join(temporaryDirectory, "pause-level-low.wav");
    const pauseLevelHighPath = path.join(temporaryDirectory, "pause-level-high.wav");
    await Promise.all([
      mixBackgroundMusic({ audioPath: pausedNarration, musicPath: music, outputPath: pauseLevelLowPath, teachingPauses: pauses, settings: { ...independentBase, musicVolume: 0.6, teachingPauseMusicLevel: 0.5 } }),
      mixBackgroundMusic({ audioPath: pausedNarration, musicPath: music, outputPath: pauseLevelHighPath, teachingPauses: pauses, settings: { ...independentBase, musicVolume: 0.6, teachingPauseMusicLevel: 1 } }),
    ]);
    const pauseSettingSpeechRatio = (await toneAmplitude(pauseLevelHighPath, 1, 1000, 0.1)) / (await toneAmplitude(pauseLevelLowPath, 1, 1000, 0.1));
    const pauseSettingPauseRatio = (await toneAmplitude(pauseLevelHighPath, 2.5, 1000, 0.1)) / (await toneAmplitude(pauseLevelLowPath, 2.5, 1000, 0.1));
    assert.ok(Math.abs(pauseSettingSpeechRatio - 1) < 0.03, `pause-level slider does not alter music during speech (${pauseSettingSpeechRatio})`);
    assert.ok(Math.abs(pauseSettingPauseRatio - 2) < 0.1, `pause-level slider independently scales music during pauses (${pauseSettingPauseRatio})`);

    const fiftyPauses = Array.from({ length: 50 }, (_, index) => ({ time: 0.1 + index * 0.1, duration: 0.01 }));
    const fiftyPausedNarration = path.join(temporaryDirectory, "fifty-pauses.wav");
    const fiftyPauseMix = path.join(temporaryDirectory, "fifty-pause-mix.wav");
    const fiftyPauseInsert = await insertTeachingPauses({
      audioPath: narration,
      teachingPauses: fiftyPauses,
      outputPath: fiftyPausedNarration,
    });
    assert.equal(fiftyPauseInsert.pauseCount, 50);
    const fiftyPauseResult = await mixBackgroundMusic({
      audioPath: fiftyPausedNarration,
      musicPath: music,
      outputPath: fiftyPauseMix,
      teachingPauses: fiftyPauses,
      settings: { ...settings, transitionDuration: 0.02 },
    });
    assert.ok(Math.abs(fiftyPauseResult.duration - 6.5) < 0.03, "50 pause ramps mix across the complete pause-extended timeline");

    const shortPausedNarration = path.join(temporaryDirectory, "short-paused-narration.wav");
    const shortPauseMix = path.join(temporaryDirectory, "short-pause-mix.wav");
    await insertTeachingPauses({
      audioPath: narration,
      teachingPauses: [{ time: 2, duration: 0.1 }],
      outputPath: shortPausedNarration,
    });
    await mixBackgroundMusic({
      audioPath: shortPausedNarration,
      musicPath: music,
      outputPath: shortPauseMix,
      teachingPauses: [{ time: 2, duration: 0.1 }],
      settings: { ...settings, transitionDuration: 0.5, fadeInDuration: 0, fadeOutDuration: 0 },
    });
    const shortPauseBoost = await toneAmplitude(shortPauseMix, 2.05, 1000, 0.05);
    assert.ok(Number.isFinite(shortPauseBoost), "short-pause FFmpeg mix renders successfully");

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

    const scenes = [
      { id: "still", title: "Teaching still", startTime: 0, duration: 3.5, mediaType: "image", mediaUrl: "/still.png", mediaPath: image },
      { id: "still-2", title: "Teaching still 2", startTime: 3.5, duration: 4, mediaType: "image", mediaUrl: "/still.png", mediaPath: image },
    ];
    await renderMixedMediaVideo({
      audioPath: mixedAudio,
      outputPath: exportPath,
      scenes,
    });
    await renderMixedMediaVideo({
      audioPath: pausedNarration,
      outputPath: noMusicExportPath,
      scenes,
    });
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name", "-of", "json", exportPath]);
    const probe = JSON.parse(stdout);
    const assertMp4 = (result, name) => {
      assert.ok(result.streams.some((stream) => stream.codec_type === "audio" && stream.codec_name === "aac"), `${name} has AAC audio`);
      assert.ok(result.streams.some((stream) => stream.codec_type === "video" && stream.codec_name === "h264"), `${name} has H.264 video`);
      assert.ok(Math.abs(Number(result.format.duration) - 7.5) < 0.1, `${name} keeps pause-extended narration duration`);
    };
    assertMp4(probe, "music MP4");
    const noMusicProbe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name", "-of", "json", noMusicExportPath])).stdout);
    assertMp4(noMusicProbe, "no-music MP4");
    const noMusicVoice = await toneAmplitude(noMusicExportPath, 1, 440);
    const sourceVoice = await toneAmplitude(pausedNarration, 1, 440);
    assert.ok(noMusicVoice >= sourceVoice * 0.85, "no-music export preserves narration without the mix stage");

    console.log(`PASS: validation; pause envelopes (2/10/50), measured control gains speech ${controlLevels.speechA.toFixed(4)} vs ${controlLevels.speechB.toFixed(4)}, pause ${controlLevels.pauseA.toFixed(4)} vs ${controlLevels.pauseB.toFixed(4)}, narration A/B ${controlLevels.voiceA.toFixed(4)}/${controlLevels.voiceB.toFixed(4)}, music-volume ratios ${musicVolumeSpeechRatio.toFixed(2)}/${musicVolumePauseRatio.toFixed(2)}, pause-level ratios ${pauseSettingSpeechRatio.toFixed(2)}/${pauseSettingPauseRatio.toFixed(2)}, gain stepping ${frameEvaluated.maximumStep.toFixed(5)} -> ${fineFrameEvaluated.maximumStep.toFixed(5)}, hsin fades; narration retained; limiter peak ${peak.toFixed(2)} dBFS; music/no-music ${result.duration.toFixed(2)}s H.264/AAC exports; source audio preserved.`);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL: background music processing", error);
  process.exitCode = 1;
});
