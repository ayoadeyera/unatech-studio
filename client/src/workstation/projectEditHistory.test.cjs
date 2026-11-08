const assert = require("node:assert/strict");

Promise.all([
  import("./projectEditHistory.ts"),
  import("../automaticScenePreparation.ts"),
]).then(([{ recordProjectEdit, travelProjectEdit, PROJECT_HISTORY_LIMIT }, { prepareScenesAutomatically }]) => {
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

  const automaticInputs = {
    visualScenes: [],
    teachingPauses: [{ id: "pause", time: 5, duration: 2, label: "Reflect" }],
    narration: { filename: "lesson.wav" },
    backgroundMusic: { filename: "music.mp3" },
    visualUploads: [{ id: "upload", url: "/safe.png" }],
  };
  const automatic = prepareScenesAutomatically(
    [{ id: "segment-1", startTime: 0, endTime: 5, duration: 5 }],
    ["asset-1"],
    [{ id: "asset-1", filename: "safe.png", originalName: "safe.png", url: "/safe.png", size: 1, mediaType: "image" }],
    automaticInputs.visualScenes,
    () => "auto-scene",
  );
  let automaticHistories = recordProjectEdit({}, "project-auto", automaticInputs, undefined, 10_000);
  const automaticCurrent = { ...automaticInputs, visualScenes: automatic.scenes };
  let automaticTravel = travelProjectEdit(automaticHistories, "project-auto", automaticCurrent, "undo");
  assert.deepEqual(automaticTravel.snapshot.visualScenes, [], "undo restores the pre-Auto-Build scene arrangement");
  assert.deepEqual(automaticInputs.visualUploads, [{ id: "upload", url: "/safe.png" }], "undo snapshots never delete uploaded media");
  assert.deepEqual(automaticInputs.teachingPauses, automaticTravel.snapshot.teachingPauses, "undo preserves pauses while restoring automatic scene preparation");
  automaticHistories = automaticTravel.histories;
  automaticTravel = travelProjectEdit(automaticHistories, "project-auto", automaticTravel.snapshot, "redo");
  assert.deepEqual(automaticTravel.snapshot.visualScenes, automatic.scenes, "redo restores the prepared scene IDs, timing and media assignments");
  assert.equal(automaticTravel.snapshot.visualScenes[0].id, "auto-scene");
  assert.equal(automaticInputs.narration.filename, "lesson.wav", "scene history does not touch narration uploads");
  assert.equal(automaticInputs.backgroundMusic.filename, "music.mp3", "scene history does not touch music uploads");
  console.log("PASS: project-scoped bounded undo/redo and coalesced title editing.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
