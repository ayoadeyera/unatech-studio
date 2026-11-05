const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { insertTeachingPauses } = require("./utils/insertTeachingPauses");

const execFileAsync = promisify(execFile);

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "unatech-pause-test-"));
  try {
    const audioPath = path.join(directory, "synthetic-narration.wav");
    const outputPath = path.join(directory, "with-teaching-pauses.wav");
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
      "-i", "sine=frequency=440:duration=30", "-c:a", "pcm_s16le", audioPath,
    ], { windowsHide: true, timeout: 300000 });
    const result = await insertTeachingPauses({
      audioPath,
      outputPath,
      teachingPauses: [
        { time: 10, duration: 3 },
        { time: 25, duration: 3 },
      ],
    });
    assert.equal(result.originalDuration, 30);
    assert.equal(result.expectedDuration, 36);
    assert.equal(result.pauseCount, 2);
    console.log("PASS: synthetic narration gains two teaching silences without modifying its source (36.00s output).");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL: teaching pause insertion", error);
  process.exitCode = 1;
});
