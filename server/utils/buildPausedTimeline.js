
function buildPausedTimeline(scenes, teachingPauses = []) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error("At least one visual scene is required.");
  }

  if (!Array.isArray(teachingPauses)) {
    throw new Error("Teaching pauses must be an array.");
  }

  const pauses = [...teachingPauses].sort(
    (a, b) => a.time - b.time
  );


  // Make a copy so the original project scenes remain unchanged.
  const filledScenes = [...scenes]
    .map((scene) => ({ ...scene }))
    .sort((a, b) => a.startTime - b.startTime);

  // Fill any gap before the first scene.
  if (filledScenes[0].startTime > 0) {
    const first = filledScenes[0];

    first.duration += first.startTime;
    first.startTime = 0;
  }

  // Extend each scene through any gap before the next scene.
  for (let i = 0; i < filledScenes.length - 1; i++) {
    const current = filledScenes[i];
    const next = filledScenes[i + 1];

    const currentEnd = current.startTime + current.duration;

    if (next.startTime < currentEnd) {
      throw new Error("Overlapping visual scenes are not supported.");
    }

    if (next.startTime > currentEnd) {
      current.duration = next.startTime - current.startTime;
    }
  }


  // Scenes are expressed in original narration time.
  // Each pause adds time to the exported timeline.
  const output = [];
  let elapsedPauseTime = 0;

for (const scene of filledScenes) {
    const sceneStart = scene.startTime;
    const sceneEnd = scene.startTime + scene.duration;

    let cursor = sceneStart;

    // A pause exactly at a scene boundary belongs to
    // the preceding scene, except at the beginning.
    const scenePauses = pauses.filter((pause) => {
      if (sceneStart === 0 && pause.time === 0) {
        return true;
      }

      return pause.time > sceneStart &&
        pause.time <= sceneEnd;
    });

    for (const pause of scenePauses) {
      if (pause.time > cursor) {
        output.push({
          ...scene,
          startTime: cursor + elapsedPauseTime,
          duration: pause.time - cursor,
          sourceOffset: cursor - sceneStart,
          isTeachingPause: false,
        });
      }

      output.push({
        ...scene,
        startTime: pause.time + elapsedPauseTime,
        duration: pause.duration,
        sourceOffset: pause.time - sceneStart,
        isTeachingPause: true,
      });

      elapsedPauseTime += pause.duration;
      cursor = pause.time;
    }

    if (cursor < sceneEnd) {
      output.push({
        ...scene,
        startTime: cursor + elapsedPauseTime,
        duration: sceneEnd - cursor,
        sourceOffset: cursor - sceneStart,
        isTeachingPause: false,
      });
    }
  }

  return output;
}

module.exports = { buildPausedTimeline };
