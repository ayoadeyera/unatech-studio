export interface NarrationSceneRange {
  id: string;
  startTime: number;
  duration: number;
  endTime?: number;
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

export function segmentCanBePlaced(
  segments: NarrationSceneRange[],
  segmentId: string,
  startTime: number,
  endTime: number,
): boolean;

export function appendNonOverlappingSegmentScenes(
  segments: NarrationSceneRange[],
  existingScenes: NarrationVisualScene[],
  idFactory: () => string,
): {
  scenes: NarrationVisualScene[];
  addedScenes: NarrationVisualScene[];
  addedCount: number;
  duplicateCount: number;
  overlapCount: number;
};
