const assert = require("node:assert/strict");

async function main() {
  const {
    getGuidedStepState,
    getGuidedStepStatusLabel,
    getProjectGuidedStage,
    updateProjectGuidedStep,
    updateProjectGuidedStage,
    validateGuidedExport,
    MAX_AUTHORED_SCENES,
    exceedsAuthoredSceneLimit,
  } = await import("../client/src/guidedProduction.ts");
  const {
    createSequentialVisualAssignments,
    planVisualAlignment,
  } = await import("../client/src/visualAlignment.ts");
  const { prepareScenesAutomatically } = await import("../client/src/automaticScenePreparation.ts");

  const readyProject = {
    id: "ready",
    title: "Ready course",
    narration: { filename: "narration.wav", originalName: "lesson.wav" },
    narrationSegments: [{ startTime: 0, endTime: 5, duration: 5 }],
    visualScenes: [
      { title: "Intro", startTime: 0, duration: 5, mediaUrl: "/intro.png" },
      { title: "Example", startTime: 5, duration: 5, mediaUrl: "/example.mp4" },
    ],
    teachingPauses: [{ time: 4, duration: 2, label: "Reflect" }],
    backgroundMusic: { filename: "music.mp3", originalName: "music.mp3" },
    backgroundMusicSettings: {
      musicVolume: 0.2,
      narrationDuckingLevel: 0.3,
      teachingPauseMusicLevel: 0.55,
    },
  };
  const validation = validateGuidedExport(readyProject, 10);
  assert.equal(validation.ready, true, "valid narration, scenes, timing, and pauses pass readiness checks");
  assert.equal(validation.sceneCount, 2);
  assert.equal(validation.populatedSceneCount, 2);
  assert.equal(validation.pauseCount, 1);
  assert.equal(validation.pauseDuration, 2);
  assert.equal(validation.outputDuration, 12, "estimated duration includes inserted pause time");
  assert.equal(getGuidedStepState("narration", readyProject, validation), "complete");
  assert.equal(getGuidedStepState("segments", readyProject, validation), "complete");
  assert.equal(getGuidedStepState("visuals", readyProject, validation), "complete");
  assert.equal(getGuidedStepState("pauses", readyProject, validation), "complete");
  assert.equal(getGuidedStepState("music", readyProject, validation), "complete");
  assert.equal(getGuidedStepState("export", readyProject, validation), "complete");
  const unavailableDurationValidation = validateGuidedExport(readyProject, null);
  assert.equal(unavailableDurationValidation.ready, false, "unknown narration duration cannot pass export readiness");
  assert.equal(unavailableDurationValidation.outputDuration, null);
  assert(unavailableDurationValidation.issues.some((issue) => issue.code === "narration-duration-unavailable"));
  for (const invalidDuration of [0, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const invalidDurationValidation = validateGuidedExport(readyProject, invalidDuration);
    assert.equal(invalidDurationValidation.ready, false, `duration ${invalidDuration} must block export readiness`);
    assert(invalidDurationValidation.issues.some((issue) => issue.code === "narration-duration-unavailable"));
  }
  const unavailableNarrationStatus = getGuidedStepState("narration", readyProject, unavailableDurationValidation);
  assert.equal(unavailableNarrationStatus, "needs-attention");
  assert.match(getGuidedStepStatusLabel("narration", unavailableNarrationStatus, unavailableDurationValidation), /Required/);
  assert.match(getGuidedStepStatusLabel("segments", "recommended"), /Optional/);
  assert.match(getGuidedStepStatusLabel("pauses", "recommended"), /Optional/);
  assert.match(getGuidedStepStatusLabel("music", "recommended"), /Optional/);
  assert.match(getGuidedStepStatusLabel("visuals", "needs-attention"), /Required/);
  assert.match(getGuidedStepStatusLabel("export", "needs-attention"), /Required/);
  const missingUploadValidation = validateGuidedExport(readyProject, 10, {
    visualUrls: ["/intro.png"],
    musicFilenames: [],
  });
  assert(missingUploadValidation.issues.some((issue) => issue.code === "missing-uploaded-media"));
  assert(missingUploadValidation.issues.some((issue) => issue.code === "missing-background-music"));

  const missingProject = {
    id: "missing",
    visualScenes: [
      { title: "Empty slot", startTime: 0, duration: 2, mediaUrl: null },
    ],
    teachingPauses: [{ time: 20, duration: 2 }],
  };
  const missingValidation = validateGuidedExport(missingProject, 10);
  const missingCodes = missingValidation.issues.map((issue) => issue.code);
  assert(missingCodes.includes("missing-narration"));
  assert(missingCodes.includes("too-few-scenes"));
  assert(missingCodes.includes("missing-scene-media"));
  assert(missingCodes.includes("invalid-pause-timing"));
  assert.equal(missingValidation.ready, false, "missing required inputs prevent export readiness");

  const overlappingProject = {
    ...readyProject,
    visualScenes: [
      { title: "Manual first", startTime: 0, duration: 6, mediaUrl: "/manual.png" },
      { title: "Second", startTime: 5, duration: 5, mediaUrl: "/second.png" },
    ],
    teachingPauses: [],
  };
  const overlapValidation = validateGuidedExport(overlappingProject, 10);
  assert(overlapValidation.issues.some((issue) => issue.code === "overlapping-scenes"));
  assert.equal(getGuidedStepState("pauses", overlappingProject, overlapValidation), "recommended", "pauses remain optional");
  assert.equal(getGuidedStepState("music", { ...overlappingProject, backgroundMusic: undefined }, overlapValidation), "recommended", "music remains optional");

  assert.equal(MAX_AUTHORED_SCENES, 20, "renderer scene limit is explicit for authored scenes");
  assert.equal(exceedsAuthoredSceneLimit(20), false, "the maximum authored scene count is allowed");
  assert.equal(exceedsAuthoredSceneLimit(21), true, "an over-limit Auto Build can be rejected before project mutation");
  const overLimitScenes = Array.from({ length: MAX_AUTHORED_SCENES + 1 }, (_, index) => ({
    title: `Scene ${index + 1}`, startTime: index, duration: 1, mediaUrl: `/scene-${index + 1}.png`,
  }));
  const overLimitValidation = validateGuidedExport({ ...readyProject, visualScenes: overLimitScenes }, MAX_AUTHORED_SCENES + 1);
  assert(overLimitValidation.issues.some((issue) => issue.code === "too-many-scenes"), "export readiness explains the authored scene limit");
  const overLimitSegments = Array.from({ length: MAX_AUTHORED_SCENES + 1 }, (_, index) => ({
    id: `over-limit-${index}`, startTime: index, endTime: index + 1, duration: 1,
  }));
  const overLimitAssets = overLimitSegments.map((_, index) => ({
    id: `over-limit-asset-${index}`, filename: `scene-${index}.png`, originalName: `scene-${index}.png`,
    url: `/scene-${index}.png`, size: 1, mediaType: "image",
  }));
  const emptyAuthoredScenes = [];
  const overLimitPreparation = prepareScenesAutomatically(
    overLimitSegments, overLimitAssets.map((asset) => asset.id), overLimitAssets, emptyAuthoredScenes,
    (segmentId) => `scene-${segmentId}`,
  );
  assert.equal(overLimitPreparation.scenes.length, MAX_AUTHORED_SCENES + 1, "the boundary case reproduces an over-limit automatic timeline proposal");
  assert(exceedsAuthoredSceneLimit(overLimitPreparation.scenes.length), "Auto Build must reject the proposal before saving any scene changes");
  assert.deepEqual(emptyAuthoredScenes, [], "a rejected automatic preparation keeps the stored arrangement unchanged");

  const sceneOutsideNarration = validateGuidedExport({
    ...readyProject,
    visualScenes: [
      { title: "First", startTime: 0, duration: 5, mediaUrl: "/first.png" },
      { title: "Past narration", startTime: 5, duration: 6, mediaUrl: "/second.png" },
    ],
  }, 10);
  assert(sceneOutsideNarration.issues.some((issue) => issue.code === "invalid-scene-timing"));

  const tooLongValidation = validateGuidedExport({
    ...readyProject,
    teachingPauses: Array.from({ length: 2 }, (_, index) => ({ time: index + 1, duration: 30 })),
  }, 250);
  assert(tooLongValidation.issues.some((issue) => issue.code === "timeline-too-long"));

  const projects = [
    { ...readyProject, guidedProduction: { activeStep: "visuals" } },
    { ...missingProject, guidedProduction: { activeStep: "narration" } },
  ];
  const updated = updateProjectGuidedStep(projects, "ready", "export");
  assert.equal(updated[0].guidedProduction.activeStep, "export");
  assert.equal(updated[1].guidedProduction.activeStep, "narration", "workflow progress is scoped to its project");
  assert.equal(updated[0].visualScenes, projects[0].visualScenes, "changing workflow step preserves existing scene objects and media");
  assert.equal(projects[0].guidedProduction.activeStep, "visuals", "workflow updates do not mutate stored project records");
  const stageUpdated = updateProjectGuidedStage(updated, "ready", "audio");
  assert.equal(stageUpdated[0].guidedProduction.activeStage, "audio", "wizard stage is persisted on its project");
  assert.equal(stageUpdated[1].guidedProduction.activeStage, undefined, "wizard stage updates remain project-scoped");
  assert.equal(getProjectGuidedStage(JSON.parse(JSON.stringify(stageUpdated[0]))), "audio", "saved wizard stage survives project reopening");
  assert.equal(getProjectGuidedStage({ guidedProduction: { activeStep: "segments" } }), "narration", "legacy segmentation step opens narration stage");
  assert.equal(getProjectGuidedStage({ guidedProduction: { activeStep: "visuals" } }), "visuals", "legacy visual step opens visuals stage");
  assert.equal(getProjectGuidedStage({ guidedProduction: { activeStep: "pauses" } }), "audio", "legacy pause step opens audio and timing stage");
  assert.equal(getProjectGuidedStage({ guidedProduction: { activeStep: "music" } }), "audio", "legacy music step opens audio and timing stage");
  assert.equal(getProjectGuidedStage({ guidedProduction: { activeStep: "export" } }), "export", "legacy export step opens preview and export stage");

  const guidedSegments = [
    { id: "segment-a", startTime: 0, endTime: 3, duration: 3 },
    { id: "segment-b", startTime: 4, endTime: 7, duration: 3 },
  ];
  const guidedAssets = [
    { id: "asset-a", filename: "a.png", originalName: "a.png", url: "/a.png", size: 1, mediaType: "image" },
    { id: "asset-b", filename: "b.mp4", originalName: "b.mp4", url: "/b.mp4", size: 1, mediaType: "video" },
  ];
  const emptySlot = {
    id: "keep-slot-id", title: "Edited segment title", startTime: 0, duration: 3,
    mediaType: "image", mediaUrl: null, originalName: null, narrationSegmentId: "segment-a",
    customEditorNote: "keep this edit",
  };
  const manualScene = {
    id: "manual-existing", title: "Manual scene", startTime: 8, duration: 1,
    mediaType: "image", mediaUrl: "/manual.png", originalName: "manual.png",
  };
  const sequential = planVisualAlignment(
    guidedSegments,
    createSequentialVisualAssignments(guidedSegments, ["asset-a", "asset-b"]),
    guidedAssets,
    [emptySlot, manualScene],
    (segmentId) => `new-${segmentId}`,
  );
  assert.equal(sequential.filledSlots.length, 1, "guided sequential assignment fills the matching empty slot");
  assert.equal(sequential.addedScenes.length, 1, "guided sequential assignment adds a new slot for the remaining segment");
  assert.equal(sequential.filledSlots[0].id, emptySlot.id);
  assert.equal(sequential.filledSlots[0].title, emptySlot.title);
  assert.equal(sequential.filledSlots[0].customEditorNote, emptySlot.customEditorNote);
  assert.deepEqual(sequential.scenes.find((scene) => scene.id === manualScene.id), manualScene, "manual media stays unchanged");
  const repeated = planVisualAlignment(
    guidedSegments,
    createSequentialVisualAssignments(guidedSegments, ["asset-a", "asset-b"]),
    guidedAssets,
    sequential.scenes,
    (segmentId) => `duplicate-${segmentId}`,
  );
  assert.equal(repeated.addedScenes.length + repeated.filledSlots.length, 0, "reapplying assignments does not duplicate or overwrite populated scenes");

  console.log("PASS: guided readiness, scene/media validation, overlap and duration checks, optional pauses/music, and project-scoped progress persistence.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
