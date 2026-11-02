
const fs = require("node:fs/promises");

const { prepareScenes } = require("./prepareScenes");
const { insertTeachingPauses } = require("./insertTeachingPauses");
const { buildPausedTimeline } = require("./buildPausedTimeline");

async function preparePausedRender({
  scenes,
  teachingPauses,
  audioPath,
  pausedAudioPath,
}) {
  if (!Array.isArray(teachingPauses) || teachingPauses.length === 0) {
    throw new Error("At least one teaching pause is required.");
  }

  const timeline = prepareScenes(scenes);

  if (timeline.scenes.length > 20 || timeline.endTime > 300) {
    throw new Error("Visual timeline exceeds rendering limits.");
  }

  // Create processed narration without changing the original.
  const audioResult = await insertTeachingPauses({
    audioPath,
    teachingPauses,
    outputPath: pausedAudioPath,
  });

  try {
    const originalDuration = audioResult.originalDuration;

    // Start from a copy of the original visual timeline.
    const adjustedScenes = timeline.scenes.map((scene) => ({
      ...scene,
    }));

    // Fill the initial gap with the first visual.
    if (adjustedScenes[0].startTime > 0) {
      const first = adjustedScenes[0];
      first.duration += first.startTime;
      first.startTime = 0;
    }

    // Fill gaps between scenes.
    for (let i = 0; i < adjustedScenes.length - 1; i++) {
      const current = adjustedScenes[i];
      const next = adjustedScenes[i + 1];

      const end = current.startTime + current.duration;

      if (next.startTime > end) {
        current.duration = next.startTime - current.startTime;
      }
    }

    // Remove scenes that begin after the narration ends.
    const usableScenes = adjustedScenes
      .filter((scene) => scene.startTime < originalDuration)
      .map((scene) => ({
        ...scene,
        duration: Math.min(
          scene.startTime + scene.duration,
          originalDuration
        ) - scene.startTime,
      }));

    if (usableScenes.length === 0) {
      throw new Error("No visual scenes cover the narration.");
    }

    // Ensure the final visual covers the original narration.
    const last = usableScenes[usableScenes.length - 1];
    const lastEnd = last.startTime + last.duration;

    if (lastEnd < originalDuration) {
      last.duration += originalDuration - lastEnd;
    }

    // Add the same pauses to the visual timeline.
    const pausedScenes = buildPausedTimeline(
      usableScenes,
      teachingPauses
    );

    if (audioResult.expectedDuration > 300) {
      throw new Error(
        "Total video duration cannot exceed 300 seconds."
      );
    }

    return {
      audioPath: audioResult.outputPath,
      scenes: pausedScenes,
      originalDuration,
      expectedDuration: audioResult.expectedDuration,
      pauseCount: audioResult.pauseCount,
    };
  } catch (error) {
    await fs.rm(pausedAudioPath, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = { preparePausedRender };
