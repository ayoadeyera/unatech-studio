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

/** Creates only missing narration slots, then assigns selected assets in order. */
export function prepareScenesAutomatically<Scene extends AlignmentVisualScene>(
  segments: AlignmentNarrationSegment[],
  selectedAssetIds: string[],
  assets: AlignmentMediaAsset[],
  existingScenes: Scene[],
  idFactory: (segmentId: string) => string,
): AutomaticScenePreparationResult<Scene> {
  const appended = appendNonOverlappingSegmentScenes(
    segments,
    existingScenes,
    () => idFactory("slot"),
  );
  const assignments = createSequentialVisualAssignments(segments, selectedAssetIds);
  const plan = planVisualAlignment(
    segments,
    assignments,
    assets,
    appended.scenes,
    idFactory,
  );
  const assignedCount = plan.filledSlots.length + plan.addedScenes.length;
  const preservedCount = existingScenes.filter((scene) =>
    plan.scenes.some((updated) => updated.id === scene.id),
  ).length;
  const skippedCount = plan.skipped.length + Math.max(0, selectedAssetIds.length - segments.length);

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
