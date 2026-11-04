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

  console.log("PASS: visual alignment covers sequential order, manual mapping, missing media, overlap rejection, repeated application, and segment-derived timing.");
}

main().catch((error) => {
  console.error("FAIL: visual alignment tests", error);
  process.exitCode = 1;
});
