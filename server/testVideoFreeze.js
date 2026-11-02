
const path = require("node:path");

const {
  renderMixedMediaVideo,
} = require("./utils/renderMixedMediaVideo");

const uploads = path.join(__dirname, "uploads");

const sourceVideo = path.join(
  uploads,
  "video-freeze-test-source.mp4"
);

const audioPath = path.join(
  uploads,
  "video-freeze-test-audio.wav"
);

const outputPath = path.join(
  uploads,
  "video-freeze-test-output.mp4"
);

const scenes = [
  {
    id: "segment-1",
    title: "Video plays",
    startTime: 0,
    duration: 10,
    mediaType: "video",
    mediaUrl: "/test-video.mp4",
    mediaPath: sourceVideo,
    sourceOffset: 0,
    isTeachingPause: false,
  },
  {
    id: "segment-2",
    title: "Frozen frame",
    startTime: 10,
    duration: 3,
    mediaType: "video",
    mediaUrl: "/test-video.mp4",
    mediaPath: sourceVideo,
    sourceOffset: 10,
    isTeachingPause: true,
  },
  {
    id: "segment-3",
    title: "Video resumes",
    startTime: 13,
    duration: 5,
    mediaType: "video",
    mediaUrl: "/test-video.mp4",
    mediaPath: sourceVideo,
    sourceOffset: 10,
    isTeachingPause: false,
  },
];

renderMixedMediaVideo({
  scenes,
  audioPath,
  outputPath,
})
  .then((result) => {
    console.log("Video freeze test successful!");
    console.log(result);
  })
  .catch((error) => {
    console.error("Video freeze test failed:");
    console.error(error.message);
    process.exitCode = 1;
  });
