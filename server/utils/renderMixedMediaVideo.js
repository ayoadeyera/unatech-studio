
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const { prepareScenes } = require("./prepareScenes");

const {
    buildVideoSegmentFilter,
} = require("./buildVideoSegmentFilter");

function getMediaDuration(filePath) {
    return new Promise((resolve, reject) => {
        execFile(
            "ffprobe",
            [
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                filePath,
            ],
            {
                timeout: 15000,
                windowsHide: true,
            },
            (error, stdout) => {
                if (error) {
                    return reject(error);
                }

                const duration = Number(stdout.trim());

                if (!Number.isFinite(duration) || duration <= 0) {
                    return reject(
                        new Error("Unable to determine narration duration.")
                    );
                }

                resolve(duration);
            }
        );
    });
}


async function renderMixedMediaVideo({
    scenes,
    audioPath,
    outputPath,
}) {
    if (!audioPath || !outputPath) {
        throw new Error("Audio and output paths are required.");
    }

    const timeline = prepareScenes(scenes);

    if (timeline.scenes.length > 20) {
        throw new Error("Maximum 20 scenes per render.");
    }


    if (timeline.endTime > 300) {
        throw new Error("Maximum timeline duration is 300 seconds.");
    }

    // Media paths must be resolved from validated project
    // uploads by the backend, never directly from user input.
    for (const scene of timeline.scenes) {
        if (
            typeof scene.mediaPath !== "string" ||
            !scene.mediaPath
        ) {
            throw new Error(
                `Scene "${scene.title}" is missing its media path.`
            );
        }
    }

    await Promise.all([
        fs.access(audioPath),
        ...timeline.scenes.map((scene) =>
            fs.access(scene.mediaPath)
        ),
    ]);


    const narrationDuration = await getMediaDuration(audioPath);

    if (narrationDuration > 300) {
        throw new Error(
            "This renderer supports narration up to 300 seconds."
        );
    }


    // Fill gaps without changing the saved project timeline.
    const filledScenes = timeline.scenes.map((scene) => ({
        ...scene,
    }));

    // If the first scene starts late, display it from 0 seconds.
    if (filledScenes[0].startTime > 0) {
        const firstScene = filledScenes[0];

        firstScene.duration += firstScene.startTime;
        firstScene.startTime = 0;
    }

    // Extend each scene up to the next scene's start.
    for (let i = 0; i < filledScenes.length - 1; i++) {
        const current = filledScenes[i];
        const next = filledScenes[i + 1];

        const currentEnd = current.startTime + current.duration;

        if (next.startTime > currentEnd) {
            current.duration = next.startTime - current.startTime;
        }
    }

    // Keep scenes that begin before the narration ends.
    // Trim scenes that extend beyond the narration.
    const renderScenes = filledScenes
        .filter((scene) => scene.startTime < narrationDuration)
        .map((scene) => ({
            ...scene,
            duration: Math.min(
                scene.startTime + scene.duration,
                narrationDuration
            ) - scene.startTime,
        }));

    if (renderScenes.length === 0) {
        throw new Error(
            "No visual scenes remain within the narration duration."
        );
    }

    // Extend the last scene when narration is longer.
    // Images remain displayed; short video clips loop.
    if (narrationDuration > timeline.endTime) {
        const lastScene = renderScenes[renderScenes.length - 1];

        lastScene.duration += narrationDuration - timeline.endTime;
    }


    await fs.mkdir(path.dirname(outputPath), {
        recursive: true,
    });

    const args = ["-hide_banner", "-y"];

    // Add images and video clips in timeline order.
    for (const scene of renderScenes) {
        if (scene.mediaType === "image") {
            args.push(
                "-loop", "1",
                "-framerate", "30",
                "-t", String(scene.duration),
                "-i", scene.mediaPath
            );

        } else {
            // Include the source offset so FFmpeg has enough
            // frames to seek, freeze, and resume the clip.
            const sourceOffset = scene.sourceOffset ?? 0;

            args.push(
                "-stream_loop", "-1",
                "-t", String(sourceOffset + scene.duration),
                "-i", scene.mediaPath
            );
        }


    }

    // Narration is the final input.
    args.push("-i", audioPath);

   
  const filters = renderScenes.map((scene, index) => {
    // Use source-aware filters for pause-adjusted video clips.
    if (
      scene.mediaType === "video" &&
      typeof scene.isTeachingPause === "boolean"
    ) {
      return buildVideoSegmentFilter(scene, index);
    }

    // Preserve the existing rendering behavior for
    // images and ordinary video scenes.
    return (
      `[${index}:v:0]` +
      "scale=1280:720:force_original_aspect_ratio=decrease," +
      "pad=1280:720:(ow-iw)/2:(oh-ih)/2," +
      "setsar=1," +
      "fps=30," +
      `trim=duration=${scene.duration},` +
      `setpts=PTS-STARTPTS,format=yuv420p[v${index}]`
    );
  });


    const videoInputs = renderScenes
        .map((_, index) => `[v${index}]`)
        .join("");

    filters.push(
        `${videoInputs}concat=n=${renderScenes.length}:v=1:a=0[vout]`
    );

    args.push(
        "-filter_complex", filters.join(";"),
        "-map", "[vout]",
        "-map", `${renderScenes.length}:a:0`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        outputPath
    );

    await new Promise((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", args, {
            windowsHide: true,
            timeout: 300000,
        });

        let errorOutput = "";
        let settled = false;

        function finish(error) {
            if (settled) return;
            settled = true;

            if (error) reject(error);
            else resolve();
        }

        ffmpeg.stderr.on("data", (data) => {
            errorOutput = (
                errorOutput + data.toString()
            ).slice(-8000);
        });

        ffmpeg.on("error", finish);

        ffmpeg.on("close", (code, signal) => {
            if (code === 0) {
                finish();
            } else {
                finish(
                    new Error(
                        `FFmpeg failed (${signal || code}).\n${errorOutput}`
                    )
                );
            }
        });
    });

    const output = await fs.stat(outputPath);

    if (output.size === 0) {
        throw new Error("FFmpeg produced an empty video.");
    }

    return {
        outputPath,
        filename: path.basename(outputPath),
        size: output.size,
        sceneCount: renderScenes.length,
    };
}

module.exports = { renderMixedMediaVideo };
