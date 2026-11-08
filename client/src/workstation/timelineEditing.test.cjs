const assert = require("node:assert/strict");

import("./timelineEditing.ts").then(({ snapTimelineTime, snapTimelineDelta, shouldScrubOnPointerMove, validateSceneTiming }) => {
  assert.equal(snapTimelineTime(3.12), 3);
  assert.equal(snapTimelineTime(3.13), 3.25);
  assert.equal(snapTimelineDelta(-0.62), -0.5, "leftward drag deltas must remain negative after snapping");
  assert.equal(snapTimelineDelta(0.62), 0.5, "rightward drag deltas must remain positive after snapping");
  assert.equal(Math.max(0, 0.25 + snapTimelineDelta(-1)), 0, "leftward movement must remain bounded at timeline start");
  assert.equal(shouldScrubOnPointerMove(false, false), false, "hover without pointer-down must not seek");
  assert.equal(shouldScrubOnPointerMove(true, false), true, "an intentional scrub gesture may seek while moving");
  assert.equal(shouldScrubOnPointerMove(true, true), false, "scene dragging must not also scrub");
  const scenes = [
    { id: "a", startTime: 0, duration: 4 },
    { id: "b", startTime: 4, duration: 3 },
  ];
  assert.deepEqual(validateSceneTiming(scenes, "a", 0, 4, 8), { valid: true });
  assert.equal(validateSceneTiming(scenes, "a", 1, 4, 8).valid, false);
  assert.equal(validateSceneTiming(scenes, "b", 2.5, 3, 8).valid, false, "a signed leftward move into another scene must still be rejected");
  assert.equal(validateSceneTiming(scenes, "b", 4, 5, 8).valid, false);
  assert.equal(validateSceneTiming(scenes, "a", -1, 2, 8).valid, false);
  console.log("PASS: timeline snapping, overlap prevention, and narration bounds.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
