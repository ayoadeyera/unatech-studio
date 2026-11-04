export type AlignmentMediaType = "image" | "video";

export interface AlignmentNarrationSegment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface AlignmentMediaAsset {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  size: number;
  mediaType: AlignmentMediaType;
}

export interface AlignmentVisualScene {
  id: string;
  title: string;
  startTime: number;
  duration: number;
  mediaType: AlignmentMediaType;
  mediaUrl: string | null;
  originalName: string | null;
  narrationSegmentId?: string;
  alignmentAssetId?: string;
}

export interface VisualAssignment {
  segmentId: string;
  assetId: string | null;
}

export type VisualAssignmentSkipReason =
  | "segment-not-found"
  | "invalid-timing"
  | "no-media-selected"
  | "media-not-found"
  | "already-assigned"
  | "duplicate-segment-slot"
  | "overlaps-existing-scene"
  | "scene-limit";

export interface SkippedVisualAssignment {
  segmentId: string;
  assetId: string | null;
  reason: VisualAssignmentSkipReason;
  conflictingSceneTitle?: string;
}

export function createSequentialVisualAssignments(
  segments: AlignmentNarrationSegment[],
  selectedAssetIds: string[],
): VisualAssignment[] {
  return segments.map((segment, index) => ({
    segmentId: segment.id,
    assetId: selectedAssetIds[index] ?? null,
  }));
}

export function createManualVisualAssignments(
  segments: AlignmentNarrationSegment[],
  assetBySegmentId: Record<string, string | null | undefined>,
): VisualAssignment[] {
  return segments.map((segment) => ({
    segmentId: segment.id,
    assetId: assetBySegmentId[segment.id] || null,
  }));
}

function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function planVisualAlignment<Scene extends AlignmentVisualScene>(
  segments: AlignmentNarrationSegment[],
  assignments: VisualAssignment[],
  assets: AlignmentMediaAsset[],
  existingScenes: Scene[],
  idFactory: (segmentId: string) => string,
  maxSceneCount = 20,
): {
  scenes: Array<Scene | AlignmentVisualScene>;
  addedScenes: AlignmentVisualScene[];
  filledSlots: AlignmentVisualScene[];
  skipped: SkippedVisualAssignment[];
} {
  const scenes: Array<Scene | AlignmentVisualScene> = [...existingScenes];
  const addedScenes: AlignmentVisualScene[] = [];
  const filledSlots: AlignmentVisualScene[] = [];
  const skipped: SkippedVisualAssignment[] = [];
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  for (const assignment of assignments) {
    const segment = segmentsById.get(assignment.segmentId);
    if (!segment) {
      skipped.push({ ...assignment, reason: "segment-not-found" });
      continue;
    }

    const duration = Number((segment.endTime - segment.startTime).toFixed(3));
    if (
      !Number.isFinite(segment.startTime) ||
      segment.startTime < 0 ||
      !Number.isFinite(segment.endTime) ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      skipped.push({ ...assignment, reason: "invalid-timing" });
      continue;
    }

    if (!assignment.assetId) {
      skipped.push({ ...assignment, reason: "no-media-selected" });
      continue;
    }

    const asset = assetsById.get(assignment.assetId);
    if (!asset || !asset.url) {
      skipped.push({ ...assignment, reason: "media-not-found" });
      continue;
    }

    const matchingSlots = scenes.filter((scene) => scene.narrationSegmentId === segment.id);
    if (matchingSlots.length > 1) {
      skipped.push({ ...assignment, reason: "duplicate-segment-slot" });
      continue;
    }
    const matchingSlot = matchingSlots[0];
    if (matchingSlot?.mediaUrl) {
      skipped.push({ ...assignment, reason: "already-assigned" });
      continue;
    }

    if (matchingSlot) {
      const slotEnd = matchingSlot.startTime + matchingSlot.duration;
      if (
        !Number.isFinite(matchingSlot.startTime) ||
        matchingSlot.startTime < 0 ||
        !Number.isFinite(matchingSlot.duration) ||
        matchingSlot.duration <= 0 ||
        !Number.isFinite(slotEnd)
      ) {
        skipped.push({ ...assignment, reason: "invalid-timing" });
        continue;
      }

      const conflict = scenes.find((scene) =>
        scene.id !== matchingSlot.id &&
        rangesOverlap(
          matchingSlot.startTime,
          slotEnd,
          scene.startTime,
          scene.startTime + scene.duration,
        )
      );
      if (conflict) {
        skipped.push({
          ...assignment,
          reason: "overlaps-existing-scene",
          conflictingSceneTitle: conflict.title,
        });
        continue;
      }

      const filled: AlignmentVisualScene = {
        ...matchingSlot,
        mediaType: asset.mediaType,
        mediaUrl: asset.url,
        originalName: asset.originalName,
        alignmentAssetId: asset.id,
      };
      const slotIndex = scenes.findIndex((scene) => scene.id === matchingSlot.id);
      scenes[slotIndex] = filled;
      filledSlots.push(filled);
      continue;
    }

    const conflict = scenes.find((scene) =>
      rangesOverlap(
        segment.startTime,
        segment.endTime,
        scene.startTime,
        scene.startTime + scene.duration,
      )
    );
    if (conflict) {
      skipped.push({
        ...assignment,
        reason: "overlaps-existing-scene",
        conflictingSceneTitle: conflict.title,
      });
      continue;
    }

    if (scenes.length >= maxSceneCount) {
      skipped.push({ ...assignment, reason: "scene-limit" });
      continue;
    }

    const scene: AlignmentVisualScene = {
      id: idFactory(segment.id),
      title: `Narration Segment ${segments.indexOf(segment) + 1}`,
      startTime: segment.startTime,
      duration,
      mediaType: asset.mediaType,
      mediaUrl: asset.url,
      originalName: asset.originalName,
      narrationSegmentId: segment.id,
      alignmentAssetId: asset.id,
    };
    scenes.push(scene);
    addedScenes.push(scene);
  }

  scenes.sort((first, second) => first.startTime - second.startTime);
  return { scenes, addedScenes, filledSlots, skipped };
}
