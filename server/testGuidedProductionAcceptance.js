const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const run = promisify(execFile);

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function createSyntheticMedia(directory) {
  const narration = path.join(directory, "guided-narration.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=3",
    "-f", "lavfi", "-i", "sine=frequency=550:sample_rate=48000:duration=2",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=3",
    "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000:duration=2",
    "-filter_complex", "[0:a][1:a][2:a][3:a][4:a]concat=n=5:v=0:a=1[out]",
    "-map", "[out]", "-c:a", "pcm_s16le", "-y", narration,
  ], { windowsHide: true, timeout: 30000 });

  const music = path.join(directory, "guided-music.mp3");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=2", "-c:a", "libmp3lame", "-b:a", "128k", "-y", music], { windowsHide: true, timeout: 30000 });
  const image = path.join(directory, "guided-image.png");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x275dad:s=640x360:d=1", "-frames:v", "1", "-y", image], { windowsHide: true, timeout: 30000 });
  const secondImage = path.join(directory, "guided-image-2.png");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0xd97706:s=640x360:d=1", "-frames:v", "1", "-y", secondImage], { windowsHide: true, timeout: 30000 });
  const video = path.join(directory, "guided-video.mp4");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=640x360:rate=24", "-an", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-movflags", "+faststart", "-y", video], { windowsHide: true, timeout: 30000 });
  return { narration, music, image, secondImage, video };
}

async function uploadFile(baseUrl, projectId, route, field, filename, mimeType) {
  const form = new FormData();
  form.append(field, new Blob([await fs.readFile(filename)], { type: mimeType }), path.basename(filename));
  const response = await fetch(`${baseUrl}/api/projects/${projectId}/${route}`, { method: "POST", body: form });
  const data = await response.json();
  assert.equal(response.status, 201, data.message || `Could not upload ${path.basename(filename)}`);
  assert.equal(data.success, true);
  return data;
}

async function main() {
  const { prepareScenesAutomatically } = await import("../client/src/automaticScenePreparation.ts");
  const { updateProjectGuidedStep, validateGuidedExport } = await import("../client/src/guidedProduction.ts");

  const projectId = crypto.randomUUID();
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const mediaDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "unatech-phase4d-acceptance-"));
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port) },
    windowsHide: true,
    stdio: "ignore",
  });
  child.on("error", () => {});

  const projectUploadRoots = ["narrations", "visuals", "background-music", "renders"]
    .map((directory) => path.resolve(__dirname, "uploads", directory, projectId));

  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Test server exited before startup (${child.exitCode}).`);
      try {
        const response = await fetch(`${baseUrl}/api/health`);
        if (response.ok) { ready = true; break; }
      } catch { /* Wait for the isolated Express process to bind its port. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, "temporary Express server starts on an isolated port");

    const assets = await createSyntheticMedia(mediaDirectory);
    const originalNarrationHash = crypto.createHash("sha256").update(await fs.readFile(assets.narration)).digest("hex");

    const narrationUpload = await uploadFile(baseUrl, projectId, "narration", "audio", assets.narration, "audio/wav");
    const narration = narrationUpload.narration;
    const segmentResponse = await fetch(`${baseUrl}/api/projects/${projectId}/narration/segments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioFilename: narration.filename }),
    });
    const segmentData = await segmentResponse.json();
    assert.equal(segmentResponse.status, 200, segmentData.message);
    assert.equal(segmentData.segments.length, 3, "FFmpeg finds the three known audio activity ranges");
    assert.equal(segmentData.duration, 12);
    const segments = segmentData.segments.map((segment, index) => ({ ...segment, id: `segment-${index + 1}` }));

    const imageUpload = await uploadFile(baseUrl, projectId, "visuals", "visual", assets.image, "image/png");
    const videoUpload = await uploadFile(baseUrl, projectId, "visuals", "visual", assets.video, "video/mp4");
    const secondImageUpload = await uploadFile(baseUrl, projectId, "visuals", "visual", assets.secondImage, "image/png");
    const libraryResponse = await fetch(`${baseUrl}/api/projects/${projectId}/visuals`);
    const libraryData = await libraryResponse.json();
    assert.equal(libraryData.media.length, 3, "all uploaded project assets appear in the project media library");

    const manualScene = {
      id: "manual-scene-stays",
      title: "Manually Edited Gap Scene",
      startTime: 2.5,
      duration: 0.8,
      mediaType: "image",
      mediaUrl: imageUpload.media.url,
      originalName: imageUpload.media.originalName,
      customEditorNote: "keep title, timing, and uploaded media",
    };
    const prepared = prepareScenesAutomatically(
      segments,
      [libraryData.media.find((item) => item.filename === imageUpload.media.filename).id,
        libraryData.media.find((item) => item.filename === videoUpload.media.filename).id,
        libraryData.media.find((item) => item.filename === secondImageUpload.media.filename).id],
      libraryData.media,
      [manualScene],
      (segmentId) => segmentId === "slot" ? `slot-${crypto.randomUUID()}` : `aligned-${segmentId}`,
    );
    assert.equal(prepared.createdCount, 3, "automatic preparation creates three missing narration scene slots");
    assert.equal(prepared.assignedCount, 3, "automatic preparation sequentially assigns the three selected uploads");
    assert.equal(prepared.skippedCount, 0);
    const alignedScenes = prepared.scenes;
    assert.deepEqual(alignedScenes.find((scene) => scene.id === manualScene.id), manualScene, "manual scene fields and media remain unchanged");
    const repeated = prepareScenesAutomatically(segments, [
      libraryData.media.find((item) => item.filename === imageUpload.media.filename).id,
      libraryData.media.find((item) => item.filename === videoUpload.media.filename).id,
      libraryData.media.find((item) => item.filename === secondImageUpload.media.filename).id,
    ], libraryData.media, JSON.parse(JSON.stringify(alignedScenes)), () => crypto.randomUUID());
    assert.equal(repeated.changed, false, "reapplying after localStorage-style reopening makes no changes");
    assert.deepEqual(repeated.scenes, alignedScenes, "repeated preparation preserves saved scene identities and media");

    const musicUpload = await uploadFile(baseUrl, projectId, "background-music", "music", assets.music, "audio/mpeg");
    const musicListResponse = await fetch(`${baseUrl}/api/projects/${projectId}/background-music`);
    const musicList = await musicListResponse.json();
    assert(musicList.music.some((item) => item.filename === musicUpload.music.filename), "project music upload is selectable after reload");

    const teachingPauses = [
      { id: "pause-a", time: 1.5, duration: 0.75, label: "Check understanding" },
      { id: "pause-b", time: 8, duration: 0.75, label: "Reflect" },
    ];
    const projectSnapshot = {
      narration,
      narrationSegments: segments,
      visualScenes: alignedScenes,
      teachingPauses,
      backgroundMusic: musicUpload.music,
      backgroundMusicSettings: { musicVolume: 0.24, narrationDuckingLevel: 0.12, teachingPauseMusicLevel: 0.62 },
    };
    const projectRecords = [
      { id: projectId, ...projectSnapshot, guidedProduction: { activeStep: "visuals" } },
      { id: "unrelated-project", title: "Preserve this other project", guidedProduction: { activeStep: "narration" } },
    ];
    const savedProjectRecords = updateProjectGuidedStep(projectRecords, projectId, "export");
    const reopenedProjectRecords = JSON.parse(JSON.stringify(savedProjectRecords));
    assert.equal(reopenedProjectRecords[0].guidedProduction.activeStep, "export", "active step persists after localStorage-style project reopen");
    assert.equal(reopenedProjectRecords[1].guidedProduction.activeStep, "narration", "workflow progress stays project-scoped");
    assert.deepEqual(reopenedProjectRecords[0].visualScenes, alignedScenes, "reopening preserves assigned and manual scenes");
    assert.deepEqual(reopenedProjectRecords[0].teachingPauses, teachingPauses, "reopening preserves teaching pauses");
    assert.equal(reopenedProjectRecords[0].backgroundMusic.filename, musicUpload.music.filename, "reopening preserves project music selection");
    const readiness = validateGuidedExport(projectSnapshot, segmentData.duration, {
      visualUrls: libraryData.media.map((asset) => asset.url),
      musicFilenames: musicList.music.map((asset) => asset.filename),
    });
    assert.equal(readiness.ready, true, readiness.issues.map((issue) => issue.message).join(" "));
    assert.equal(readiness.outputDuration, 13.5, "readiness includes the two inserted pause durations");
    assert.equal(validateGuidedExport(projectSnapshot, null).ready, false, "project reopening before audio metadata loads must still block export");

    const renderResponse = await fetch(`${baseUrl}/api/projects/${projectId}/render-mixed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioFilename: narration.filename,
        scenes: alignedScenes,
        teachingPauses,
        backgroundMusicFilename: musicUpload.music.filename,
        backgroundMusicSettings: projectSnapshot.backgroundMusicSettings,
      }),
    });
    const renderData = await renderResponse.json();
    assert.equal(renderResponse.status, 201, renderData.message || "mixed-media MP4 export failed");
    assert.equal(renderData.success, true);
    const download = await fetch(`${baseUrl}${renderData.video.url}`);
    assert.equal(download.status, 200, "MP4 is downloadable from the project render endpoint");
    const mp4Path = path.join(mediaDirectory, "guided-acceptance.mp4");
    await fs.writeFile(mp4Path, Buffer.from(await download.arrayBuffer()));
    const probe = await run("ffprobe", [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", mp4Path,
    ], { windowsHide: true, timeout: 30000 });
    const probeData = JSON.parse(probe.stdout);
    const outputDuration = Number(probeData.format.duration);
    const streamTypes = probeData.streams.map((stream) => stream.codec_type);
    assert(Math.abs(outputDuration - readiness.outputDuration) < 0.2, `MP4 output duration ${outputDuration}s matches estimated ${readiness.outputDuration}s`);
    assert(streamTypes.includes("video") && streamTypes.includes("audio"), "export contains synchronized audio and video streams");
    assert.equal(crypto.createHash("sha256").update(await fs.readFile(assets.narration)).digest("hex"), originalNarrationHash, "source narration remains unchanged");

    console.log(`PASS: guided acceptance project ${projectId}; uploaded narration, detected ${segments.length} segments, appended and sequentially filled slots, preserved manual scene, uploaded/selectable music, validated two pauses, and exported ${outputDuration.toFixed(2)}s mixed-media MP4 (${streamTypes.join("+")}).`);
  } finally {
    child.kill();
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    for (const root of projectUploadRoots) {
      const uploadsBase = path.resolve(__dirname, "uploads");
      const resolvedRoot = path.resolve(root);
      assert(resolvedRoot.startsWith(`${uploadsBase}${path.sep}`), "test cleanup remains under the server uploads root");
      await fs.rm(resolvedRoot, { recursive: true, force: true });
    }
    await fs.rm(mediaDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
