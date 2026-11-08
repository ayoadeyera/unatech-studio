const assert = require("node:assert/strict");

import("./projectEditHistory.ts").then(({ recordProjectEdit, travelProjectEdit, PROJECT_HISTORY_LIMIT }) => {
  const initial = { visualScenes: [{ id:"scene", title:"Before", startTime:0, duration:4, mediaType:"image", mediaUrl:null, originalName:null }], teachingPauses:[] };
  const changed = { visualScenes: [{ ...initial.visualScenes[0], title:"After" }], teachingPauses:[] };
  let histories = recordProjectEdit({}, "project-a", initial, "scene:scene:title", 1000);
  histories = recordProjectEdit(histories, "project-a", changed, "scene:scene:title", 1500);
  assert.equal(histories["project-a"].undo.length, 1, "rapid title typing is a single undo step");
  assert.equal(histories["project-b"], undefined, "history is isolated by project ID");
  let result = travelProjectEdit(histories, "project-a", changed, "undo");
  assert.equal(result.snapshot.visualScenes[0].title, "Before");
  result = travelProjectEdit(result.histories, "project-a", initial, "redo");
  assert.equal(result.snapshot.visualScenes[0].title, "After");
  histories = {};
  for (let i = 0; i < PROJECT_HISTORY_LIMIT + 10; i++) histories = recordProjectEdit(histories, "project-a", initial, undefined, i * 1000);
  assert.equal(histories["project-a"].undo.length, PROJECT_HISTORY_LIMIT, "undo history is bounded");
  console.log("PASS: project-scoped bounded undo/redo and coalesced title editing.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
