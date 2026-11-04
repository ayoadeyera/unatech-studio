const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const {
  detectNarrationSegments,
  parseSilenceIntervals,
  buildSpeechActivitySegments,
} = require("./utils/detectNarrationSegments");

const execFileAsync = promisify(execFile);

async function main() {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "unatech-segmentation-"));
  const wavPath = path.join(tempDirectory, "known-intervals.wav");
  const mp3Path = path.join(tempDirectory, "known-intervals.mp3");

  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.9",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.6",
      "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000:duration=1.0",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.5",
      "-filter_complex", "[0:a][1:a][2:a][3:a]concat=n=4:v=0:a=1[out]",
      "-map", "[out]", "-c:a", "pcm_s16le", wavPath,
    ]);

    const result = await detectNarrationSegments(wavPath);
    assert.ok(Math.abs(result.duration - 3.0) < 0.03, `expected duration near 3.0s, got ${result.duration}`);
    assert.equal(result.segments.length, 2, `expected two activity ranges, got ${JSON.stringify(result.segments)}`);
    assert.ok(Math.abs(result.segments[0].startTime - 0) < 0.03);
    assert.ok(Math.abs(result.segments[0].endTime - 0.9) < 0.12, `first end ${result.segments[0].endTime}`);
    assert.ok(Math.abs(result.segments[1].startTime - 1.5) < 0.12, `second start ${result.segments[1].startTime}`);
    assert.ok(Math.abs(result.segments[1].endTime - 2.5) < 0.12, `second end ${result.segments[1].endTime}`);
    for (const segment of result.segments) {
      assert.ok(segment.duration > 0);
      assert.equal(segment.duration, Number((segment.endTime - segment.startTime).toFixed(3)));
    }

    await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wavPath, "-codec:a", "libmp3lame", "-q:a", "4", mp3Path]);
    const mp3Result = await detectNarrationSegments(mp3Path);
    assert.equal(mp3Result.segments.length, 2, `expected two MP3 activity ranges, got ${JSON.stringify(mp3Result.segments)}`);
    assert.ok(Math.abs(mp3Result.segments[0].endTime - 0.9) < 0.18);
    assert.ok(Math.abs(mp3Result.segments[1].startTime - 1.5) < 0.18);

    const parsed = parseSilenceIntervals("silence_start: 0.9\nsilence_end: 1.5\nsilence_start: 2.5", 3);
    assert.deepEqual(parsed, [{ start: 0.9, end: 1.5 }, { start: 2.5, end: 3 }]);
    assert.deepEqual(buildSpeechActivitySegments([], 1), [{ startTime: 0, endTime: 1, duration: 1 }]);
    console.log("PASS: FFmpeg detects known activity ranges in WAV and MP3, handles trailing silence, and returns consistent timestamps/durations.");
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL: narration segmentation test", error);
  process.exitCode = 1;
});
