const assert = require("node:assert/strict");

async function main() {
  const { prepareScenesAutomatically } = await import("./automaticScenePreparation.ts");
  const segments = [
    { id: "seg-a", startTime: 0, endTime: 2, duration: 2 },
    { id: "seg-b", startTime: 3, endTime: 5, duration: 2 },
    { id: "seg-c", startTime: 6, endTime: 8, duration: 2 },
  ];
  const assets = [
    { id: "img-a", filename: "a.png", originalName: "a.png", url: "/a.png", size: 10, mediaType: "image" },
    { id: "vid-b", filename: "b.mp4", originalName: "b.mp4", url: "/b.mp4", size: 20, mediaType: "video" },
    { id: "img-c", filename: "c.png", originalName: "c.png", url: "/c.png", size: 30, mediaType: "image" },
  ];
  let sceneId = 0;
  const idFactory = (segmentId) => `new-${segmentId}-${++sceneId}`;
  const manual = { id: "manual", title: "Edited manually", startTime: 8.5, duration: 1, mediaType: "image", mediaUrl: "/manual.png", originalName: "manual.png", customEditorNote: "keep" };
  const filled = { id: "already-filled", title: "Custom title", startTime: 3, duration: 2, mediaType: "image", mediaUrl: "/existing.png", originalName: "existing.png", narrationSegmentId: "seg-b", customEditorNote: "preserve" };
  const first = prepareScenesAutomatically(segments, ["img-a", "vid-b", "img-c"], assets, [manual, filled], idFactory);
  assert.equal(first.createdCount, 2, "only the missing slots are created");
  assert.equal(first.assignedCount, 2, "assets are assigned sequentially while a populated segment is kept");
  assert.equal(first.preservedCount, 2, "manual and populated scenes remain in the project");
  assert.deepEqual(first.scenes.find((scene) => scene.id === manual.id), manual, "manual edits remain byte-for-byte equivalent");
  assert.deepEqual(first.scenes.find((scene) => scene.id === filled.id), filled, "existing populated slot and timing remain unchanged");
  const firstSlot = first.scenes.find((scene) => scene.narrationSegmentId === "seg-a");
  const thirdSlot = first.scenes.find((scene) => scene.narrationSegmentId === "seg-c");
  assert.equal(firstSlot.mediaUrl, "/a.png", "first selected upload maps to first unfilled segment");
  assert.equal(thirdSlot.mediaUrl, "/c.png", "third selected upload remains mapped to the third segment");
  assert.equal(firstSlot.startTime, 0);
  assert.equal(firstSlot.duration, 2);

  const reopened = JSON.parse(JSON.stringify(first.scenes));
  const repeated = prepareScenesAutomatically(segments, ["img-a", "vid-b", "img-c"], assets, reopened, idFactory);
  assert.equal(repeated.changed, false, "repeated preparation makes no changes");
  assert.deepEqual(repeated.scenes, reopened, "reopening then repeating does not alter IDs, timing or assets");
  assert.equal(repeated.createdCount, 0);
  assert.equal(repeated.assignedCount, 0);

  const partial = prepareScenesAutomatically(segments, ["img-a"], assets, [], idFactory);
  const partialAgain = prepareScenesAutomatically(segments, ["img-a"], assets, JSON.parse(JSON.stringify(partial.scenes)), idFactory);
  assert.equal(partialAgain.changed, false, "a partial selection does not shift onto the next segment on a second click");
  assert.deepEqual(partialAgain.scenes, partial.scenes);

  const unavailable = prepareScenesAutomatically(segments, ["gone"], [], [], idFactory);
  assert.equal(unavailable.createdCount, 3, "segments still get safe empty slots when the library has no available media");
  assert.equal(unavailable.assignedCount, 0);
  assert.equal(unavailable.skippedCount, 3);
  assert(unavailable.scenes.every((scene) => scene.mediaUrl === null), "missing uploads are never fabricated or overwritten");

  const overlap = { id: "overlap", title: "Manual blocker", startTime: 0.5, duration: 0.5, mediaType: "image", mediaUrl: "/keep.png", originalName: "keep.png" };
  const rejected = prepareScenesAutomatically(segments.slice(0, 1), ["img-a"], assets, [overlap], idFactory);
  assert.equal(rejected.createdCount, 0, "overlapping scene prevents automatic slot creation");
  assert.equal(rejected.assignedCount, 0);
  assert.deepEqual(rejected.scenes, [overlap], "overlap blocker remains untouched");

  console.log("PASS: automatic preparation creates only missing non-overlapping slots, fills selected assets in order, preserves manual/populated scenes, handles unavailable media, and is idempotent after project reopening.");
}

main().catch((error) => {
  console.error("FAIL: automatic scene preparation", error);
  process.exitCode = 1;
});
