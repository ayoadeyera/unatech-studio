const STAGE_LABELS = new Set([
  "validation",
  "pause-preparation",
  "background-mix",
  "video-encoding",
]);

function sanitizeRenderDiagnostic(error, stage, id) {
  const stageName = STAGE_LABELS.has(stage) ? stage : "validation";
  const rawMessage = error instanceof Error ? error.message : "Unknown rendering error.";
  let message;

  if (/Too many visual segments after inserting teaching pauses/i.test(rawMessage)) {
    message = "Pause expansion created more video segments than this renderer allows. Reduce the number of visual scenes or teaching pauses.";
  } else if (/timeline duration|up to 300 seconds|maximum timeline duration/i.test(rawMessage)) {
    message = "The combined narration and teaching pauses exceed the 5 minute export limit.";
  } else if (error?.code === "ENOENT" || /spawn (?:ffmpeg|ffprobe).*ENOENT/i.test(rawMessage)) {
    message = "FFmpeg or FFprobe is unavailable on the server PATH. Install FFmpeg and verify both commands are available, then restart the server.";
  } else if (/FFmpeg failed|FFmpeg background music mix failed/i.test(rawMessage)) {
    const lines = rawMessage
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-5)
      .map((line) => line
        .replace(/[A-Za-z]:\\[^\s"']+/g, "[path]")
        .replace(/\/(?:[^\s/:]+\/)+[^\s/:]+/g, "[path]")
        .replace(/\s+/g, " "));
    message = `FFmpeg could not encode the project. ${lines.join(" · ")}`;
  } else if (/missing its media path|uploaded media files were not found|missing its media/i.test(rawMessage)) {
    message = "A scene refers to unavailable uploaded media. Refresh the media library and replace the missing scene asset.";
  } else if (/Unable to determine narration duration|narration duration/i.test(rawMessage)) {
    message = "The narration duration could not be read. Re-select a supported MP3 or WAV file and try again.";
  } else {
    message = "Check that narration and scene uploads are valid, then retry. If it continues, share the diagnostic reference with the server log.";
  }

  return { id, stage: stageName, message: message.slice(0, 420) };
}

module.exports = { sanitizeRenderDiagnostic };
