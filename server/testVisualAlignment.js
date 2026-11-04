const assert = require("node:assert/strict");

async function main() {
  const {
    createManualVisualAssignments,
    createSequentialVisualAssignments,
    planVisualAlignment,
  } = await import("../client/src/visualAlignment.ts");

  const segments = [
    { id: "seg-a", startTime: 0, endTime: 2, duration: 2 },
    { id: "seg-b", startTime: 3, endTime: 5.5, duration: 2.5 },
    { id: "seg-c", startTime: 7, endTime: 9, duration: 2 },
  ];
  const assets = [
    { id: "image-a", filename: "a.png", originalName: "a.png", url: "/a.png", size: 100, mediaType: "image" },
    { id: "video-b", filename: "b.mp4", originalName: "b.mp4", url: "/b.mp4", size: 200, mediaType: "video" },
    { id: "image-c", filename: "c.webp", originalName: "c.webp", url: "/c.webp", size: 300, mediaType: "image" },
  ];
  const idFactory = (segmentId) => `scene-${segmentId}`;

  const sequentialAssignments = createSequentialVisualAssignments(segments, ["video-b", "image-a"]);
  assert.deepEqual(sequentialAssignments, [
    { segmentId: "seg-a", assetId: "video-b" },
    { segmentId: "seg-b", assetId: "image-a" },
    { segmentId: "seg-c", assetId: null },
  ], "sequential mode maps selected assets in order and leaves unmatched segments explicit");
  const sequentialPlan = planVisualAlignment(segments, sequentialAssignments, assets, [], idFactory);
  assert.equal(sequentialPlan.addedScenes.length, 2);
  assert.equal(sequentialPlan.addedScenes[0].mediaType, "video");
  assert.equal(sequentialPlan.addedScenes[0].alignmentAssetId, "video-b");
  assert.equal(sequentialPlan.skipped[0].reason, "no-media-selected");

  const manualAssignments = createManualVisualAssignments(segments, {
    "seg-a": "image-c",
    "seg-b": "video-b",
    "seg-c": "image-a",
  });
  const manualPlan = planVisualAlignment(segments, manualAssignments, assets, [], idFactory);
  assert.deepEqual(manualPlan.addedScenes.map((scene) => scene.alignmentAssetId), [
    "image-c", "video-b", "image-a",
  ], "manual mapping honors the chosen asset for each segment");

  const missingMedia = planVisualAlignment(
    segments.slice(0, 1),
    [{ segmentId: "seg-a", assetId: "deleted-asset" }],
    assets,
    [],
    idFactory,
  );
  assert.equal(missingMedia.addedScenes.length, 0);
  assert.equal(missingMedia.skipped[0].reason, "media-not-found");

  const manualScene = {
    id: "manual-scene",
    title: "Manually Edited Scene",
    startTime: 0.5,
    duration: 1,
    mediaType: "video",
    mediaUrl: "/user-upload.mp4",
    originalName: "user-upload.mp4",
  };
  const overlapPlan = planVisualAlignment(
    segments.slice(0, 1),
    [{ segmentId: "seg-a", assetId: "image-a" }],
    assets,
    [manualScene],
    idFactory,
  );
  assert.equal(overlapPlan.addedScenes.length, 0);
  assert.equal(overlapPlan.skipped[0].reason, "overlaps-existing-scene");
  assert.equal(overlapPlan.skipped[0].conflictingSceneTitle, "Manually Edited Scene");
  assert.deepEqual(overlapPlan.scenes, [manualScene], "overlap rejection preserves the existing scene and uploaded media");

  const durationPlan = planVisualAlignment(
    segments.slice(1, 2),
    [{ segmentId: "seg-b", assetId: "video-b" }],
    assets,
    [],
    idFactory,
  );
  assert.equal(durationPlan.addedScenes[0].startTime, 3);
  assert.equal(durationPlan.addedScenes[0].duration, 2.5);
  assert.equal(durationPlan.addedScenes[0].mediaUrl, "/b.mp4");

  const repeatedPlan = planVisualAlignment(
    segments.slice(1, 2),
    [{ segmentId: "seg-b", assetId: "image-c" }],
    assets,
    durationPlan.scenes,
    idFactory,
  );
  assert.equal(repeatedPlan.addedScenes.length, 0, "reapplication never duplicates or replaces the segment scene");
  assert.equal(repeatedPlan.skipped[0].reason, "already-assigned");
  assert.deepEqual(repeatedPlan.scenes[0], durationPlan.scenes[0], "reapplication preserves scene timing and media");

  const phaseFourASlot = {
    id: "existing-seg-b-slot",
    title: "Teacher's edited slot title",
    startTime: 3.25,
    duration: 2,
    mediaType: "image",
    mediaUrl: null,
    originalName: null,
    narrationSegmentId: "seg-b",
    manualNote: "keep this edit",
  };
  const filledSlotPlan = planVisualAlignment(
    segments.slice(1, 2),
    [{ segmentId: "seg-b", assetId: "video-b" }],
    assets,
    [phaseFourASlot],
    idFactory,
  );
  assert.equal(filledSlotPlan.addedScenes.length, 0, "filling a Phase 4A slot does not create another scene");
  assert.equal(filledSlotPlan.filledSlots.length, 1);
  assert.deepEqual(filledSlotPlan.scenes[0], {
    ...phaseFourASlot,
    mediaType: "video",
    mediaUrl: "/b.mp4",
    originalName: "b.mp4",
    alignmentAssetId: "video-b",
  }, "filling a slot preserves its ID, timing, title, and other manual edits");

  const repeatedFilledSlot = planVisualAlignment(
    segments.slice(1, 2),
    [{ segmentId: "seg-b", assetId: "image-c" }],
    assets,
    filledSlotPlan.scenes,
    idFactory,
  );
  assert.equal(repeatedFilledSlot.filledSlots.length, 0);
  assert.equal(repeatedFilledSlot.skipped[0].reason, "already-assigned");
  assert.deepEqual(repeatedFilledSlot.scenes[0], filledSlotPlan.scenes[0], "reapplication never replaces populated slot media");

  const manuallyPopulatedSlot = {
    ...phaseFourASlot,
    mediaUrl: "/manual-upload.mp4",
    originalName: "manual-upload.mp4",
    mediaType: "video",
  };
  const populatedSlotPlan = planVisualAlignment(
    segments.slice(1, 2),
    [{ segmentId: "seg-b", assetId: "image-c" }],
    assets,
    [manuallyPopulatedSlot],
    idFactory,
  );
  assert.equal(populatedSlotPlan.skipped[0].reason, "already-assigned");
  assert.deepEqual(populatedSlotPlan.scenes[0], manuallyPopulatedSlot, "manual uploads are never overwritten automatically");

  const overlappingSlotPlan = planVisualAlignment(
    segments.slice(1, 2),
    [{ segmentId: "seg-b", assetId: "image-c" }],
    assets,
    [
      phaseFourASlot,
      { id: "manual-overlap", title: "Overlapping manual scene", startTime: 4, duration: 0.5, mediaType: "image", mediaUrl: "/manual.png", originalName: "manual.png" },
    ],
    idFactory,
  );
  assert.equal(overlappingSlotPlan.filledSlots.length, 0);
  assert.equal(overlappingSlotPlan.skipped[0].reason, "overlaps-existing-scene");
  assert.equal(overlappingSlotPlan.skipped[0].conflictingSceneTitle, "Overlapping manual scene");
  assert.equal(overlappingSlotPlan.scenes[0].mediaUrl, null, "overlap rejection leaves the empty slot untouched");

  console.log("PASS: visual alignment covers sequential/manual mapping, missing media, overlap rejection, repeated application, timing, safe Phase 4A slot filling, and preserving populated/manual scenes.");
}

main().catch((error) => {
  console.error("FAIL: visual alignment tests", error);
  process.exitCode = 1;
});
