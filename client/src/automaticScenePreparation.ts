import { appendNonOverlappingSegmentScenes } from "./narrationSceneWorkflow.ts";
import {
  createSequentialVisualAssignments,
  planVisualAlignment,
  type AlignmentMediaAsset,
  type AlignmentNarrationSegment,
  type AlignmentVisualScene,
} from "./visualAlignment.ts";

export interface AutomaticScenePreparationResult<Scene extends AlignmentVisualScene> {
  scenes: Array<Scene | AlignmentVisualScene>;
  createdCount: number;
  assignedCount: number;
  preservedCount: number;
  skippedCount: number;
  skippedReasons: string[];
  changed: boolean;
}

/** Use an explicit ordered selection, or all project uploads in library order. */
export function resolveAutomaticAssetSelection(
  selectedAssetIds: string[],
  assets: AlignmentMediaAsset[],
): string[] {
  return selectedAssetIds.length ? [...selectedAssetIds] : assets.map((asset) => asset.id);
}

/** Creates only missing narration slots, then assigns selected assets in order. */
export function prepareScenesAutomatically<Scene extends AlignmentVisualScene>(
  segments: AlignmentNarrationSegment[],
  selectedAssetIds: string[],
  assets: AlignmentMediaAsset[],
  existingScenes: Scene[],
  idFactory: (segmentId: string) => string,
): AutomaticScenePreparationResult<Scene> {
  const availableAssetIds = selectedAssetIds.filter((assetId) =>
    assets.some((asset) => asset.id === assetId && Boolean(asset.url))
  );
  const preparationSegments = existingScenes.length === 0 &&
    availableAssetIds.length > 0 &&
    availableAssetIds.length < segments.length
    ? groupSegmentsForAvailableVisuals(segments, availableAssetIds.length)
    : segments;
  const appended = appendNonOverlappingSegmentScenes(
    preparationSegments,
    existingScenes,
    () => idFactory("slot"),
  );
  const assignments = createSequentialVisualAssignments(preparationSegments, availableAssetIds);
  const plan = planVisualAlignment(
    preparationSegments,
    assignments,
    assets,
    appended.scenes,
    idFactory,
  );
  const assignedCount = plan.filledSlots.length + plan.addedScenes.length;
  const preservedCount = existingScenes.filter((scene) =>
    plan.scenes.some((updated) => updated.id === scene.id),
  ).length;
  const skippedCount = plan.skipped.length + Math.max(0, selectedAssetIds.length - preparationSegments.length);

  return {
    scenes: plan.scenes,
    createdCount: appended.addedCount,
    assignedCount,
    preservedCount,
    skippedCount,
    skippedReasons: plan.skipped.map((item) => item.reason),
    changed: appended.addedCount > 0 || assignedCount > 0,
  };
}

/**
 * For a fresh project with fewer visuals than activity ranges, combine adjacent
 * ranges into chronological visual spans. This keeps Auto Build within the
 * renderer's scene limit and spreads the selected media across the narration.
 * Existing scenes are never regrouped; callers only use this for an empty
 * timeline, so saved scene IDs, timing and manual work remain untouched.
 */
function groupSegmentsForAvailableVisuals(
  segments: AlignmentNarrationSegment[],
  groupCount: number,
): AlignmentNarrationSegment[] {
  if (groupCount <= 0 || groupCount >= segments.length) return segments;

  const ordered = [...segments].sort((first, second) => first.startTime - second.startTime);
  const canGroup = ordered.every((segment) =>
    Number.isFinite(segment.startTime) &&
    Number.isFinite(segment.endTime) &&
    segment.startTime >= 0 &&
    segment.endTime > segment.startTime
  );
  if (!canGroup) return segments;

  const timelineStart = ordered[0].startTime;
  const timelineEnd = Math.max(...ordered.map((segment) => segment.endTime));
  const timelineDuration = timelineEnd - timelineStart;
  if (!Number.isFinite(timelineDuration) || timelineDuration <= 0) return segments;

  return Array.from({ length: groupCount }, (_, index) => {
    const anchorIndex = Math.floor(index * ordered.length / groupCount);
    const roundedStartTime = Number((timelineStart + timelineDuration * index / groupCount).toFixed(3));
    const endTime = Number((index === groupCount - 1
      ? timelineEnd
      : timelineStart + timelineDuration * (index + 1) / groupCount).toFixed(3));
    // Leave a 2 ms guard between generated slots so floating-point addition
    // cannot turn equal boundaries into accidental overlaps.
    const duration = Number((endTime - roundedStartTime - (index === groupCount - 1 ? 0 : 0.002)).toFixed(3));
    return {
      // A source ID is a stable anchor. The persisted scene interval prevents
      // later runs from appending overlapping source-level slots.
      id: ordered[anchorIndex].id,
      startTime: roundedStartTime,
      endTime,
      duration,
    };
  });
}
