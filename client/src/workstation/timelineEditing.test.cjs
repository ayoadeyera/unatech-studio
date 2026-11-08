const assert = require("node:assert/strict");

import("./timelineEditing.ts").then(({ snapTimelineTime, validateSceneTiming }) => {
  assert.equal(snapTimelineTime(3.12), 3);
  assert.equal(snapTimelineTime(3.13), 3.25);
  const scenes = [
    { id: "a", startTime: 0, duration: 4 },
    { id: "b", startTime: 4, duration: 3 },
  ];
  assert.deepEqual(validateSceneTiming(scenes, "a", 0, 4, 8), { valid: true });
  assert.equal(validateSceneTiming(scenes, "a", 1, 4, 8).valid, false);
  assert.equal(validateSceneTiming(scenes, "b", 4, 5, 8).valid, false);
  assert.equal(validateSceneTiming(scenes, "a", -1, 2, 8).valid, false);
  console.log("PASS: timeline snapping, overlap prevention, and narration bounds.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
