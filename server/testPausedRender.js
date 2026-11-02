
const fs = require("node:fs");
const path = require("node:path");
const { preparePausedRender } = require("./utils/preparePausedRender");

const projectId = "d1347e5b-187d-4688-b97c-0c8292f0a5bd";

const folder = path.join(
  __dirname, "uploads", "narrations", projectId
);

const filename = fs.readdirSync(folder).find(
  (file) => /\.(mp3|wav)$/i.test(file)
);

if (!filename) {
  throw new Error("Narration file not found.");
}

preparePausedRender({
  audioPath: path.join(folder, filename),
  pausedAudioPath: path.join(
    __dirname, "uploads", "teaching-pause-integration-test.wav"
  ),
  scenes: [
    {
      id: "scene-1",
      title: "Introduction",
      startTime: 0,
      duration: 10,
      mediaType: "image",
      mediaUrl: "/test-image-1.png",
    },
    {
      id: "scene-2",
      title: "Explanation",
      startTime: 20,
      duration: 10,
      mediaType: "image",
      mediaUrl: "/test-image-2.png",
    },
  ],
  teachingPauses: [
    { time: 15, duration: 3 },
    { time: 25, duration: 3 },
  ],
})
  .then((result) => {
    console.log("Integration test successful!");
    console.log("Expected duration:", result.expectedDuration);
    console.log("Pause count:", result.pauseCount);

    console.table(result.scenes.map((scene) => ({
      title: scene.title,
      start: Number(scene.startTime.toFixed(2)),
      duration: Number(scene.duration.toFixed(2)),
      pause: scene.isTeachingPause,
    })));
  })
  .catch((error) => {
    console.error("Integration test failed:", error.message);
    process.exitCode = 1;
  });
