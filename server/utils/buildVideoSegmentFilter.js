
function buildVideoSegmentFilter(scene, index) {
  if (!scene || scene.mediaType !== "video") {
    throw new Error("A video scene is required.");
  }

  const duration = scene.duration;
  const offset = scene.sourceOffset ?? 0;

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(offset) ||
    offset < 0
  ) {
    throw new Error("Invalid video segment timing.");
  }

  const input = `[${index}:v:0]`;
  const output = `[v${index}]`;

  const normalize =
    "scale=1280:720:force_original_aspect_ratio=decrease," +
    "pad=1280:720:(ow-iw)/2:(oh-ih)/2," +
    "setsar=1," +
    "fps=30," +
    "format=yuv420p";


  if (scene.isTeachingPause === true) {
    // Extract the frame at the source pause position,
    // then repeat that exact frame for the pause duration.
    return (
      input +
      `trim=start=${offset},` +
      "setpts=PTS-STARTPTS," +
      normalize + "," +
      "trim=end_frame=1," +
      "setpts=PTS-STARTPTS," +
      "loop=loop=-1:size=1:start=0," +
      `trim=duration=${duration},` +
      `setpts=PTS-STARTPTS${output}`
    );
  }


  // Resume the clip at its recorded source offset.
  return (
    input +
    `trim=start=${offset}:duration=${duration},` +
    "setpts=PTS-STARTPTS," +
    normalize + "," +
    `trim=duration=${duration},` +
    `setpts=PTS-STARTPTS${output}`
  );
}

module.exports = { buildVideoSegmentFilter };
