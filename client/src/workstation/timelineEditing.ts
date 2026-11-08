import type { VisualScene } from "./models";

export type SceneTiming = Pick<VisualScene, "id" | "startTime" | "duration">;

export function snapTimelineTime(seconds: number, step = 0.25): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Number((Math.round(seconds / step) * step).toFixed(3));
}

export function validateSceneTiming(
  scenes: readonly SceneTiming[],
  sceneId: string,
  startTime: number,
  duration: number,
  timelineDuration: number,
): { valid: true } | { valid: false; reason: string } {
  if (!Number.isFinite(startTime) || !Number.isFinite(duration) || startTime < 0 || duration <= 0) {
    return { valid: false, reason: "Scene timing must be positive and finite." };
  }
  const endTime = startTime + duration;
  if (Number.isFinite(timelineDuration) && timelineDuration > 0 && endTime > timelineDuration + 0.001) {
    return { valid: false, reason: "Scene timing cannot extend beyond the narration." };
  }
  const overlap = scenes.find((scene) => scene.id !== sceneId && startTime < scene.startTime + scene.duration - 0.001 && endTime > scene.startTime + 0.001);
  return overlap
    ? { valid: false, reason: `That edit overlaps ${overlap.id === sceneId ? "another scene" : "an existing scene"}.` }
    : { valid: true };
}
