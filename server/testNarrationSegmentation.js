const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const {
  detectNarrationSegments,
  parseSilenceIntervals,
  buildSpeechActivitySegments,
} = require("./utils/detectNarrationSegments");
const execFileAsync = promisify(execFile);

async function main() {
  const {
    appendNonOverlappingSegmentScenes,
    segmentCanBePlaced,
  } = await import("../client/src/narrationSceneWorkflow.ts");

  const regressionScene = {
    id: "manual-scene",
    title: "Manually Edited Introduction",
    startTime: 0,
    duration: 2,
    mediaType: "video",
    mediaUrl: "/uploads/user-video.mp4",
    originalName: "user-video.mp4",
  };
  assert.equal(segmentCanBePlaced([
    { id: "first", startTime: 0, endTime: 1 },
    { id: "second", startTime: 1.5, endTime: 2.5 },
  ], "second", 0.9, 1.6), false, "overlapping suggested segment edits must be rejected");
  assert.equal(segmentCanBePlaced([
    { id: "first", startTime: 0, endTime: 1 },
    { id: "second", startTime: 1.5, endTime: 2.5 },
  ], "second", 1, 2), true, "touching boundaries are not an overlap");

  const conflictResult = appendNonOverlappingSegmentScenes([
    { id: "conflict", startTime: 1, endTime: 3, duration: 2 },
  ], [regressionScene], () => "unused-id");
  assert.equal(conflictResult.addedCount, 0, "overlapping manual scene should block a slot");
  assert.equal(conflictResult.overlapCount, 1);
  assert.deepEqual(conflictResult.scenes, [regressionScene], "the existing manual scene must be unchanged");

  let overlapSlotNumber = 0;
  const overlappingSuggestions = appendNonOverlappingSegmentScenes([
    { id: "overlap-a", startTime: 5, endTime: 7, duration: 2 },
    { id: "overlap-b", startTime: 6, endTime: 8, duration: 2 },
  ], [], () => `overlap-slot-${++overlapSlotNumber}`);
  assert.equal(overlappingSuggestions.addedCount, 1, "the appender must reject overlapping candidates even if invalid data reaches it");
  assert.equal(overlappingSuggestions.overlapCount, 1);

  const firstApply = appendNonOverlappingSegmentScenes([
    { id: "segment-a", startTime: 3, endTime: 5, duration: 2 },
  ], [regressionScene], () => "generated-slot");
  assert.equal(firstApply.addedCount, 1);
  const editedExistingScenes = firstApply.scenes.map((scene) => scene.id === "generated-slot"
    ? { ...scene, title: "My edited scene", startTime: 3.2, duration: 1.7, mediaType: "video", mediaUrl: "/uploads/kept.mp4", originalName: "kept.mp4" }
    : scene);
  const priorGeneratedSlot = editedExistingScenes.find((scene) => scene.id === "generated-slot");
  const reapplied = appendNonOverlappingSegmentScenes([
    { id: "segment-a", startTime: 6, endTime: 8, duration: 2 },
  ], editedExistingScenes, () => "duplicate-id");
  assert.equal(reapplied.addedCount, 0, "editing and reapplying the same segment must not duplicate its slot");
  assert.equal(reapplied.duplicateCount, 1);
  assert.deepEqual(reapplied.scenes.find((scene) => scene.id === "generated-slot"), priorGeneratedSlot,
    "manual scene timing, title, and uploaded media must survive reapplication");

  const modernSceneWithDifferentSegmentId = {
    ...priorGeneratedSlot,
    title: "Narration Segment 1",
    startTime: 6,
    duration: 2,
    narrationSegmentId: "modern-segment-a",
  };
  const differentModernId = appendNonOverlappingSegmentScenes([
    { id: "modern-segment-b", startTime: 6, endTime: 8, duration: 2 },
  ], [modernSceneWithDifferentSegmentId], () => "must-not-append");
  assert.equal(differentModernId.addedCount, 0);
  assert.equal(differentModernId.duplicateCount, 0,
    "modern scenes with a different stable segment ID must not match by title and timing");
  assert.equal(differentModernId.overlapCount, 1,
    "the different-ID modern scene remains protected by overlap prevention");
  assert.deepEqual(differentModernId.scenes, [modernSceneWithDifferentSegmentId],
    "a modern scene matched by neither stable ID nor legacy rules must remain unchanged");

  const splitReapply = appendNonOverlappingSegmentScenes([
    { id: "split-a", startTime: 3, endTime: 4, duration: 1 },
    { id: "split-b", startTime: 4, endTime: 5, duration: 1 },
  ], firstApply.scenes, () => "split-generated-id");
  assert.equal(splitReapply.addedCount, 0, "split suggestions cannot overlap an existing full-range slot");
  assert.equal(splitReapply.overlapCount, 2);
  assert.equal(splitReapply.duplicateCount, 0, "a numbered legacy title with different timing is not a duplicate match");

  const legacySceneOne = {
    id: "legacy-one",
    title: "Narration Segment 1",
    startTime: 0,
    duration: 1.25,
    mediaType: "video",
    mediaUrl: "/uploads/legacy-one.mp4",
    originalName: "legacy-one.mp4",
  };
  const legacySceneTwo = {
    id: "legacy-two",
    title: "Narration Segment 2",
    startTime: 3,
    duration: 1.5,
    mediaType: "image",
    mediaUrl: "/uploads/legacy-two.png",
    originalName: "legacy-two.png",
  };

  const reorderedAfterTimingEdits = appendNonOverlappingSegmentScenes([
    { id: "reordered-b", startTime: 10, endTime: 11.5, duration: 1.5 },
    { id: "reordered-a", startTime: 20, endTime: 21.25, duration: 1.25 },
  ], [legacySceneOne, legacySceneTwo], () => "reordered-edited-slot");
  assert.equal(reorderedAfterTimingEdits.addedCount, 2,
    "reordered segments with edited timing must not be mistaken for old slots by title position");
  assert.equal(reorderedAfterTimingEdits.duplicateCount, 0);
  assert.deepEqual(reorderedAfterTimingEdits.scenes.filter((scene) => scene.id.startsWith("legacy-")),
    [legacySceneOne, legacySceneTwo], "reapplying reordered segments must preserve prior legacy scene edits and media");

  const reorderedLegacy = appendNonOverlappingSegmentScenes([
    { id: "reordered-b", startTime: 3, endTime: 4.5, duration: 1.5 },
    { id: "reordered-a", startTime: 0, endTime: 1.25, duration: 1.25 },
  ], [legacySceneOne, legacySceneTwo], () => "unexpected-reordered-slot");
  assert.equal(reorderedLegacy.addedCount, 0);
  assert.equal(reorderedLegacy.duplicateCount, 2,
    "reordered suggestions match legacy slots by their numbered title and timing, independent of array index");
  assert.deepEqual(reorderedLegacy.scenes, [legacySceneOne, legacySceneTwo],
    "reordered matching must preserve legacy media and manual scene fields");

  const mergedLegacy = appendNonOverlappingSegmentScenes([
    { id: "merged", startTime: 0, endTime: 4, duration: 4 },
  ], [legacySceneOne, legacySceneTwo], () => "unexpected-merged-slot");
  assert.equal(mergedLegacy.addedCount, 0);
  assert.equal(mergedLegacy.duplicateCount, 0,
    "a numbered legacy title with a different merged duration must not count as already applied");
  assert.equal(mergedLegacy.overlapCount, 1, "the merged range is safely rejected because it overlaps existing scenes");
  assert.deepEqual(mergedLegacy.scenes, [legacySceneOne, legacySceneTwo],
    "merge handling must not alter legacy scene timing or media");

  const splitLegacyScene = {
    ...legacySceneOne,
    id: "legacy-full-range",
    duration: 4,
    mediaUrl: "/uploads/full-range.mp4",
    originalName: "full-range.mp4",
  };
  const splitLegacy = appendNonOverlappingSegmentScenes([
    { id: "split-left", startTime: 0, endTime: 2, duration: 2 },
    { id: "split-right", startTime: 2, endTime: 4, duration: 2 },
  ], [splitLegacyScene], () => "unexpected-split-slot");
  assert.equal(splitLegacy.addedCount, 0);
  assert.equal(splitLegacy.duplicateCount, 0,
    "neither split range matches the timing of the prior full-range legacy slot");
  assert.equal(splitLegacy.overlapCount, 2, "both split ranges are rejected instead of overlapping the prior scene");
  assert.deepEqual(splitLegacy.scenes, [splitLegacyScene],
    "split handling must preserve existing uploaded media and scene edits");

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "unatech-segmentation-"));
  const wavPath = path.join(tempDirectory, "known-intervals.wav");
  const mp3Path = path.join(tempDirectory, "known-intervals.mp3");

  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.9",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.6",
      "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000:duration=1.0",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.5",
      "-filter_complex", "[0:a][1:a][2:a][3:a]concat=n=4:v=0:a=1[out]",
      "-map", "[out]", "-c:a", "pcm_s16le", wavPath,
    ]);

    const result = await detectNarrationSegments(wavPath);
    assert.ok(Math.abs(result.duration - 3.0) < 0.03, `expected duration near 3.0s, got ${result.duration}`);
    assert.equal(result.segments.length, 2, `expected two activity ranges, got ${JSON.stringify(result.segments)}`);
    assert.ok(Math.abs(result.segments[0].startTime - 0) < 0.03);
    assert.ok(Math.abs(result.segments[0].endTime - 0.9) < 0.12, `first end ${result.segments[0].endTime}`);
    assert.ok(Math.abs(result.segments[1].startTime - 1.5) < 0.12, `second start ${result.segments[1].startTime}`);
    assert.ok(Math.abs(result.segments[1].endTime - 2.5) < 0.12, `second end ${result.segments[1].endTime}`);
    for (const segment of result.segments) {
      assert.ok(segment.duration > 0);
      assert.equal(segment.duration, Number((segment.endTime - segment.startTime).toFixed(3)));
    }

    await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wavPath, "-codec:a", "libmp3lame", "-q:a", "4", mp3Path]);
    const mp3Result = await detectNarrationSegments(mp3Path);
    assert.equal(mp3Result.segments.length, 2, `expected two MP3 activity ranges, got ${JSON.stringify(mp3Result.segments)}`);
    assert.ok(Math.abs(mp3Result.segments[0].endTime - 0.9) < 0.18);
    assert.ok(Math.abs(mp3Result.segments[1].startTime - 1.5) < 0.18);

    const parsed = parseSilenceIntervals("silence_start: 0.9\nsilence_end: 1.5\nsilence_start: 2.5", 3);
    assert.deepEqual(parsed, [{ start: 0.9, end: 1.5 }, { start: 2.5, end: 3 }]);
    assert.deepEqual(buildSpeechActivitySegments([], 1), [{ startTime: 0, endTime: 1, duration: 1 }]);
    console.log("PASS: scene regressions prevent overlapping suggestions and existing-scene conflicts, avoid duplicate slots after edits/reapplication, preserve uploaded media/manual edits, and recognize legacy Phase 4A slots.");
    console.log("PASS: FFmpeg detects known activity ranges in WAV and MP3, handles trailing silence, and returns consistent timestamps/durations.");
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL: narration segmentation test", error);
  process.exitCode = 1;
});
