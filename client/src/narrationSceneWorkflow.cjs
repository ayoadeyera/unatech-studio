function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function segmentCanBePlaced(segments, segmentId, startTime, endTime) {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime <= startTime) {
    return false;
  }

  return !segments.some((segment) => segment.id !== segmentId && rangesOverlap(
    startTime,
    endTime,
    segment.startTime,
    segment.endTime,
  ));
}

function appendNonOverlappingSegmentScenes(segments, existingScenes, idFactory) {
  const scenes = [...existingScenes];
  const addedScenes = [];
  let duplicateCount = 0;
  let overlapCount = 0;

  segments.forEach((segment, index) => {
    const endTime = segment.startTime + segment.duration;
    const alreadyApplied = scenes.some((scene) =>
      scene.narrationSegmentId === segment.id ||
      // Slots created by Phase 4A before provenance was added used this title.
      scene.title === `Narration Segment ${index + 1}`
    );

    if (alreadyApplied) {
      duplicateCount += 1;
      return;
    }

    const overlapsScene = scenes.some((scene) => rangesOverlap(
      segment.startTime,
      endTime,
      scene.startTime,
      scene.startTime + scene.duration,
    ));
    if (overlapsScene) {
      overlapCount += 1;
      return;
    }

    const newScene = {
      id: idFactory(),
      title: `Narration Segment ${index + 1}`,
      startTime: segment.startTime,
      duration: segment.duration,
      mediaType: "image",
      mediaUrl: null,
      originalName: null,
      narrationSegmentId: segment.id,
    };
    scenes.push(newScene);
    addedScenes.push(newScene);
  });

  scenes.sort((a, b) => a.startTime - b.startTime);
  return { scenes, addedScenes, addedCount: addedScenes.length, duplicateCount, overlapCount };
}

module.exports = { segmentCanBePlaced, appendNonOverlappingSegmentScenes };
