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

function isMatchingLegacySegmentScene(scene, segment) {
  const isLegacyTitle = /^Narration Segment \d+$/.test(scene.title ?? "");
  const timingMatches =
    Math.abs(scene.startTime - segment.startTime) <= 0.001 &&
    Math.abs(scene.duration - segment.duration) <= 0.001;
  return isLegacyTitle && timingMatches;
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
      // Legacy slots lack provenance, so require both the legacy title pattern and exact timing.
      (scene.narrationSegmentId == null && isMatchingLegacySegmentScene(scene, segment))
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
