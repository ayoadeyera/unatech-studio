const assert = require("node:assert/strict");
const { buildPausedTimeline } = require("./utils/buildPausedTimeline");
const { MAX_RENDER_SEGMENTS } = require("./utils/renderMixedMediaVideo");
const { sanitizeRenderDiagnostic } = require("./utils/renderDiagnostics");

// Reproduce the real project shape observed in the editor: 16 scenes and
// seven pauses that fall inside visual scenes. Each interior pause adds two
// render slices while leaving the authored project scenes untouched.
const starts = [0, 5.037, 7.109, 9.755, 12.506, 14.555, 18.354, 23.596,
  25.52, 34.896, 36.793, 42.392, 43.144, 46.706, 49.125, 51.697];
const durations = [4.328, 1.821, 2.193, 2.306, 1.602, 3.536, 4.873, 1.569,
  3.472, 1.537, 5.366, 0.465, 3.233, 2.061, 2.328, 6.806];
const scenes = starts.map((startTime, index) => ({
  id: `scene-${index + 1}`,
  title: `Scene ${index + 1}`,
  startTime,
  duration: durations[index],
  mediaType: "image",
  mediaUrl: `/media/${index + 1}.jpg`,
}));
const pauses = [4, 9, 23, 25, 34, 42, 46].map((time) => ({ time, duration: 3 }));
const realExpanded = buildPausedTimeline(scenes, pauses);
assert.equal(scenes.length, 16);
assert.equal(realExpanded.length, 30);
assert.ok(realExpanded.length > 20);
assert.ok(realExpanded.length <= MAX_RENDER_SEGMENTS);

const diagnostic = sanitizeRenderDiagnostic(
  new Error("FFmpeg failed (1).\nC:\\Users\\sample\\private.mp4: Invalid data found"),
  "video-encoding",
  "request-123",
);
assert.equal(diagnostic.id, "request-123");
assert.equal(diagnostic.stage, "video-encoding");
assert.match(diagnostic.message, /FFmpeg could not encode/);
assert.doesNotMatch(diagnostic.message, /C:\\Users|private\.mp4/);

const capDiagnostic = sanitizeRenderDiagnostic(
  new Error("Too many visual segments after inserting teaching pauses. This rendering mode currently supports 20 segments."),
  "pause-preparation",
  "request-456",
);
assert.match(capDiagnostic.message, /Reduce the number of visual scenes or teaching pauses/);

console.log("PASS: real project timing expands to 30 bounded render slices; diagnostics redact paths and identify actionable causes.");
