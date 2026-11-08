const assert = require("node:assert/strict");

import("./visualBatchUpload.ts").then(async ({ uploadVisualBatch }) => {
  const files = [{name:"a.png"},{name:"b.mp4"},{name:"c.jpg"}];
  const order = [];
  const progress = [];
  const result = await uploadVisualBatch(files, async (file) => {
    order.push(file.name);
    if (file.name === "b.mp4") throw new Error("network error");
    return `stored:${file.name}`;
  }, (index, file) => progress.push(`${index}:${file.name}`));
  assert.deepEqual(order, ["a.png", "b.mp4", "c.jpg"], "uploads are sequential and continue after an individual failure");
  assert.deepEqual(progress, ["0:a.png", "1:b.mp4", "2:c.jpg"]);
  assert.deepEqual(result.uploaded.map((item) => item.file.name), ["a.png", "c.jpg"]);
  assert.equal(result.failed[0].name, "b.mp4");
  console.log("PASS: batch uploads keep order and report per-file failures without discarding successful assets.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
