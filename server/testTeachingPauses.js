
const path = require("node:path");
const fs = require("node:fs");
const { insertTeachingPauses } = require("./utils/insertTeachingPauses");

const projectId = "d1347e5b-187d-4688-b97c-0c8292f0a5bd";

const narrationFolder = path.join(
  __dirname,
  "uploads",
  "narrations",
  projectId
);

const audioFile = fs.readdirSync(narrationFolder).find(
  (file) => file.endsWith(".mp3") || file.endsWith(".wav")
);

if (!audioFile) {
  throw new Error("No narration file found.");
}

const audioPath = path.join(narrationFolder, audioFile);

const outputPath = path.join(
  __dirname,
  "uploads",
  "teaching-pause-test.wav"
);

insertTeachingPauses({
  audioPath,
  outputPath,
  teachingPauses: [
    { time: 10, duration: 3 },
    { time: 25, duration: 3 },
  ],
})
  .then((result) => {
    console.log("Teaching pause test successful!");
    console.log(result);
  })
  .catch((error) => {
    console.error("Teaching pause test failed:", error.message);
    process.exitCode = 1;
  });
