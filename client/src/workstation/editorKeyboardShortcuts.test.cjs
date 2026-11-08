const assert = require("node:assert/strict");

async function main() {
  const { resolveEditorShortcut } = await import("./editorKeyboardShortcuts.ts");
  const press = (key, options = {}) => resolveEditorShortcut({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...options,
  });

  assert.equal(press(" "), "toggle-playback");
  assert.equal(press(" ", { repeat: true }), null, "holding Space cannot repeatedly toggle playback");
  assert.equal(press(" ", { shiftKey: true }), null);
  assert.equal(press("ArrowLeft"), "seek-back-1");
  assert.equal(press("ArrowRight"), "seek-forward-1");
  assert.equal(press("ArrowLeft", { shiftKey: true }), "seek-back-5");
  assert.equal(press("ArrowRight", { shiftKey: true }), "seek-forward-5");
  assert.equal(press("Home"), "timeline-start");
  assert.equal(press("End"), "timeline-end");
  assert.equal(press("z", { ctrlKey: true }), "undo");
  assert.equal(press("z", { metaKey: true }), "undo");
  assert.equal(press("y", { ctrlKey: true }), "redo");
  assert.equal(press("z", { ctrlKey: true, shiftKey: true }), "redo");
  assert.equal(press("z", { altKey: true, ctrlKey: true }), null, "Alt-modified browser commands are preserved");
  assert.equal(press("?"), "toggle-shortcut-help");
  assert.equal(press("?", { metaKey: true }), null);

  for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "AUDIO", "VIDEO", "A"]) {
    assert.equal(press(" ", { target: { tagName } }), null, `${tagName} keeps native control behavior`);
    assert.equal(press("z", { ctrlKey: true, target: { tagName } }), null, `${tagName} keeps its own undo behavior`);
  }
  assert.equal(press("ArrowLeft", { target: { tagName: "DIV", isContentEditable: true } }), null);
  assert.equal(press("ArrowLeft", { target: { tagName: "DIV", getAttribute: (name) => name === "role" ? "slider" : null } }), null);
  assert.equal(press(" ", { target: { tagName: "SPAN", parentElement: { tagName: "BUTTON" } } }), null, "nested control content is ignored");
  assert.equal(press(" ", { target: { tagName: "DIV", getAttribute: (name) => name === "role" ? "button" : null } }), "toggle-playback", "timeline scene Space controls playback");

  console.log("PASS: editor shortcut mapping, modifiers, repeat suppression, and editable/native-control suppression.");
}

main().catch((error) => {
  console.error("FAIL: editor keyboard shortcuts", error);
  process.exitCode = 1;
});
