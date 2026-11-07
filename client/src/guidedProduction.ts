export type GuidedStepId =
  | "narration"
  | "segments"
  | "visuals"
  | "pauses"
  | "music"
  | "export";

export interface GuidedProjectSnapshot {
  narration?: { filename?: string | null; originalName?: string | null } | null;
  narrationSegments?: Array<{ startTime: number; endTime: number; duration: number }>;
  visualScenes?: Array<{
    title: string;
    startTime: number;
    duration: number;
    mediaUrl: string | null;
  }>;
  teachingPauses?: Array<{ time: number; duration: number; label?: string }>;
  backgroundMusic?: { filename?: string | null; originalName?: string | null } | null;
  backgroundMusicSettings?: {
    musicVolume: number;
    narrationDuckingLevel: number;
    teachingPauseMusicLevel: number;
  };
}

export interface GuidedIssue {
  code: string;
  message: string;
}

export interface GuidedExportValidation {
  issues: GuidedIssue[];
  sceneCount: number;
  populatedSceneCount: number;
  pauseCount: number;
  pauseDuration: number;
  outputDuration: number | null;
  ready: boolean;
}

export type GuidedStepStatus = "complete" | "recommended" | "needs-attention";

export interface GuidedProjectRecord {
  id: string;
  guidedProduction?: { activeStep: GuidedStepId };
}

export function updateProjectGuidedStep<Project extends GuidedProjectRecord>(
  projects: Project[],
  projectId: string,
  activeStep: GuidedStepId,
): Project[] {
  return projects.map((project) => project.id === projectId
    ? {
      ...project,
      guidedProduction: {
        ...(project.guidedProduction ?? { activeStep: "narration" as const }),
        activeStep,
      },
    }
    : project);
}

const MAX_TIMELINE_SECONDS = 300;
const MAX_SCENES = 20;
const MAX_PAUSES = 50;

export function validateGuidedExport(
  project: GuidedProjectSnapshot | null | undefined,
  narrationDuration: number | null,
  mediaAvailability?: { visualUrls?: string[] | null; musicFilenames?: string[] | null },
): GuidedExportValidation {
  const issues: GuidedIssue[] = [];
  const scenes = project?.visualScenes ?? [];
  const pauses = project?.teachingPauses ?? [];
  const usableDuration = narrationDuration !== null && Number.isFinite(narrationDuration) && narrationDuration > 0
    ? narrationDuration
    : null;

  if (!project?.narration?.filename) {
    issues.push({ code: "missing-narration", message: "Upload narration before exporting." });
  } else if (usableDuration === null) {
    issues.push({
      code: "narration-duration-unavailable",
      message: "Narration duration is loading or unavailable. Wait for the audio metadata or reselect the narration before exporting.",
    });
  }
  if (scenes.length < 2) {
    issues.push({ code: "too-few-scenes", message: "Add at least two visual scenes." });
  }
  if (scenes.length > MAX_SCENES) {
    issues.push({ code: "too-many-scenes", message: `The renderer supports at most ${MAX_SCENES} visual scenes.` });
  }
  if (scenes.some((scene) => !scene.mediaUrl)) {
    issues.push({ code: "missing-scene-media", message: "Upload media for every visual scene." });
  }
  if (mediaAvailability?.visualUrls && scenes.some((scene) =>
    Boolean(scene.mediaUrl) && !mediaAvailability.visualUrls?.includes(scene.mediaUrl as string)
  )) {
    issues.push({ code: "missing-uploaded-media", message: "One or more scene uploads are missing from this project. Re-upload or reassign the media before exporting." });
  }
  if (
    project?.backgroundMusic?.filename &&
    mediaAvailability?.musicFilenames &&
    !mediaAvailability.musicFilenames.includes(project.backgroundMusic.filename)
  ) {
    issues.push({ code: "missing-background-music", message: "The selected background music file is missing from this project. Select an available track or disable music." });
  }

  const orderedScenes = [...scenes].sort((first, second) => first.startTime - second.startTime);
  let invalidSceneTiming = false;
  let overlappingScenes = false;
  orderedScenes.forEach((scene, index) => {
    const endTime = scene.startTime + scene.duration;
    if (
      !Number.isFinite(scene.startTime) || scene.startTime < 0 ||
      !Number.isFinite(scene.duration) || scene.duration <= 0 ||
      !Number.isFinite(endTime) || endTime > MAX_TIMELINE_SECONDS
    ) {
      invalidSceneTiming = true;
    }
    if (index > 0) {
      const previous = orderedScenes[index - 1];
      if (previous.startTime + previous.duration > scene.startTime + 0.001) {
        overlappingScenes = true;
      }
    }
    if (usableDuration !== null && Number.isFinite(endTime) && endTime > usableDuration + 0.05) {
      invalidSceneTiming = true;
    }
  });
  if (invalidSceneTiming) {
    issues.push({ code: "invalid-scene-timing", message: "Scene timing must be valid, stay within the narration, and finish within 300 seconds." });
  }
  if (overlappingScenes) {
    issues.push({ code: "overlapping-scenes", message: "Visual scenes overlap. Adjust their timing before exporting." });
  }

  if (pauses.length > MAX_PAUSES) {
    issues.push({ code: "too-many-pauses", message: `The renderer supports at most ${MAX_PAUSES} teaching pauses.` });
  }
  const invalidPauseTiming = pauses.some((pause) =>
    !Number.isFinite(pause.time) || pause.time < 0 || pause.time > MAX_TIMELINE_SECONDS ||
    !Number.isFinite(pause.duration) || pause.duration <= 0 || pause.duration > 30 ||
    (usableDuration !== null && pause.time > usableDuration)
  );
  if (invalidPauseTiming) {
    issues.push({ code: "invalid-pause-timing", message: "Teaching pauses must fall within the narration timeline and use durations from 0 to 30 seconds." });
  }

  const pauseDuration = pauses.reduce((total, pause) =>
    Number.isFinite(pause.duration) && pause.duration > 0 ? total + pause.duration : total, 0);
  const baseDuration = usableDuration;
  const outputDuration = baseDuration === null ? null : baseDuration + pauseDuration;
  if (outputDuration !== null && outputDuration > MAX_TIMELINE_SECONDS) {
    issues.push({ code: "timeline-too-long", message: "Narration plus teaching pauses exceeds the 300-second export limit." });
  }

  return {
    issues,
    sceneCount: scenes.length,
    populatedSceneCount: scenes.filter((scene) => Boolean(scene.mediaUrl)).length,
    pauseCount: pauses.length,
    pauseDuration,
    outputDuration,
    ready: issues.length === 0,
  };
}

export function getGuidedStepState(
  step: GuidedStepId,
  project: GuidedProjectSnapshot | null | undefined,
  validation: GuidedExportValidation,
): GuidedStepStatus {
  switch (step) {
    case "narration":
      return project?.narration?.filename && !validation.issues.some((issue) => issue.code === "narration-duration-unavailable")
        ? "complete"
        : "needs-attention";
    case "segments":
      return (project?.narrationSegments?.length ?? 0) > 0 ? "complete" : "recommended";
    case "visuals": {
      const visualIssueCodes = new Set([
        "too-few-scenes", "too-many-scenes", "missing-scene-media", "missing-uploaded-media",
        "invalid-scene-timing", "overlapping-scenes",
      ]);
      return validation.sceneCount >= 2 &&
        validation.populatedSceneCount === validation.sceneCount &&
        !validation.issues.some((issue) => visualIssueCodes.has(issue.code))
        ? "complete"
        : "needs-attention";
    }
    case "pauses":
      if ((project?.teachingPauses?.length ?? 0) === 0) return "recommended";
      return validation.issues.some((issue) => issue.code === "invalid-pause-timing" || issue.code === "too-many-pauses" || issue.code === "timeline-too-long")
        ? "needs-attention"
        : "complete";
    case "music":
      if (!project?.backgroundMusic?.filename) return "recommended";
      return validation.issues.some((issue) => issue.code === "missing-background-music") ? "needs-attention" : "complete";
    case "export":
      return validation.ready ? "complete" : "needs-attention";
  }
}

export function getGuidedStepStatusLabel(
  step: GuidedStepId,
  status: GuidedStepStatus,
  validation?: GuidedExportValidation,
): string {
  if (status === "complete") return step === "export" ? "Ready to export" : "Complete";
  if (status === "needs-attention") {
    switch (step) {
      case "narration": return validation?.issues.some((issue) => issue.code === "missing-narration")
        ? "Required — upload narration"
        : "Required — wait for valid narration duration";
      case "visuals": return "Required — assign media and fix timing";
      case "pauses": return "Check pause timing";
      case "music": return "Selected track unavailable";
      case "export": return "Required checks remain";
      case "segments": return "Review segment suggestions";
    }
  }
  switch (step) {
    case "segments": return "Optional — suggest segments";
    case "pauses": return "Optional — none added";
    case "music": return "Optional — no track selected";
    case "narration": return "Required — upload narration";
    case "visuals": return "Required — assign visuals";
    case "export": return "Required — resolve checks";
  }
}
