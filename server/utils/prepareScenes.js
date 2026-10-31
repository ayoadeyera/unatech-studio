
function prepareScenes(scenes) {
  if (!Array.isArray(scenes)) {
    throw new Error("Visual scenes must be an array.");
  }

  if (scenes.length === 0) {
    throw new Error("At least one visual scene is required.");
  }

  const prepared = scenes.map((scene, index) => {
    if (!scene || typeof scene !== "object") {
      throw new Error(`Scene ${index + 1} is invalid.`);
    }

    const { id, title, startTime, duration, mediaType, mediaUrl } = scene;

    if (
      typeof startTime !== "number" ||
      !Number.isFinite(startTime) ||
      startTime < 0 ||
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      throw new Error(`Scene ${index + 1} has invalid timing.`);
    }

    if (mediaType !== "image" && mediaType !== "video") {
      throw new Error(`Scene ${index + 1} has an invalid media type.`);
    }

    if (typeof mediaUrl !== "string" || !mediaUrl.trim()) {
      throw new Error(`Scene ${index + 1} has no uploaded media.`);
    }

    return {
      id,
      title,
      startTime,
      duration,
      endTime: startTime + duration,
      mediaType,
      mediaUrl,
    };
  }).sort((a, b) => a.startTime - b.startTime);

  const gaps = [];

  if (prepared[0].startTime > 0) {
    gaps.push({
      startTime: 0,
      duration: prepared[0].startTime,
    });
  }

  for (let i = 1; i < prepared.length; i++) {
    const previous = prepared[i - 1];
    const current = prepared[i];

    if (current.startTime < previous.endTime) {
      throw new Error(
        `Scenes overlap: "${previous.title}" and "${current.title}".`
      );
    }

    if (current.startTime > previous.endTime) {
      gaps.push({
        startTime: previous.endTime,
        duration: current.startTime - previous.endTime,
      });
    }
  }

  return {
    scenes: prepared,
    gaps,
    endTime: prepared[prepared.length - 1].endTime,
  };
}

module.exports = { prepareScenes };
