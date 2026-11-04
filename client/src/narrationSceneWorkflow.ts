export interface NarrationSegmentRange {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface NarrationVisualScene {
  id: string;
  title: string;
  startTime: number;
  duration: number;
  mediaType: "image" | "video";
  mediaUrl: string | null;
  originalName: string | null;
  narrationSegmentId?: string;
}

export interface AppendedNarrationScenes<Scene extends NarrationVisualScene> {
  scenes: Array<Scene | NarrationVisualScene>;
  addedScenes: NarrationVisualScene[];
  addedCount: number;
  duplicateCount: number;
  overlapCount: number;
}

function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function segmentCanBePlaced(
  segments: NarrationSegmentRange[],
  segmentId: string,
  startTime: number,
  endTime: number,
): boolean {
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    startTime < 0 ||
    endTime <= startTime
  ) {
    return false;
  }

  return !segments.some((segment) =>
    segment.id !== segmentId &&
    rangesOverlap(startTime, endTime, segment.startTime, segment.endTime)
  );
}

function isMatchingLegacySegmentScene(
  scene: NarrationVisualScene,
  segment: NarrationSegmentRange,
): boolean {
  if (scene.narrationSegmentId != null) return false;

  const isLegacyTitle = /^Narration Segment \d+$/.test(scene.title);
  const timingMatches =
    Math.abs(scene.startTime - segment.startTime) <= 0.001 &&
    Math.abs(scene.duration - segment.duration) <= 0.001;

  return isLegacyTitle && timingMatches;
}

export function appendNonOverlappingSegmentScenes<Scene extends NarrationVisualScene>(
  segments: NarrationSegmentRange[],
  existingScenes: Scene[],
  idFactory: () => string,
): AppendedNarrationScenes<Scene> {
  const scenes: Array<Scene | NarrationVisualScene> = [...existingScenes];
  const addedScenes: NarrationVisualScene[] = [];
  let duplicateCount = 0;
  let overlapCount = 0;

  segments.forEach((segment, index) => {
    const endTime = segment.startTime + segment.duration;
    const alreadyApplied = scenes.some((scene) =>
      scene.narrationSegmentId === segment.id ||
      (scene.narrationSegmentId == null && isMatchingLegacySegmentScene(scene, segment))
    );

    if (alreadyApplied) {
      duplicateCount += 1;
      return;
    }

    const overlapsScene = scenes.some((scene) =>
      rangesOverlap(
        segment.startTime,
        endTime,
        scene.startTime,
        scene.startTime + scene.duration,
      )
    );
    if (overlapsScene) {
      overlapCount += 1;
      return;
    }

    const newScene: NarrationVisualScene = {
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

  scenes.sort((first, second) => first.startTime - second.startTime);
  return {
    scenes,
    addedScenes,
    addedCount: addedScenes.length,
    duplicateCount,
    overlapCount,
  };
}
