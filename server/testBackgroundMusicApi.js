const assert = require("node:assert/strict");
const { spawn, execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const execFileAsync = promisify(execFile);

async function main() {
  const port = 5100 + Math.floor(Math.random() * 1000);
  const projectId = crypto.randomUUID();
  const otherProjectId = crypto.randomUUID();
  const projectDirectory = path.join(__dirname, "uploads", "background-music", projectId);
  const fixturePath = path.join(__dirname, `.background-music-api-${projectId}.wav`);
  const previewPath = path.join(__dirname, `.background-music-api-preview-${projectId}.wav`);
  const child = spawn(process.execPath, ["index.js"], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
      "-i", "sine=frequency=220:duration=0.25", "-c:a", "pcm_s16le", fixturePath,
    ], { windowsHide: true, timeout: 300000 });
    const baseUrl = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`API server exited with ${child.exitCode}`);
      try {
        const response = await fetch(`${baseUrl}/api/health`);
        if (response.ok) { ready = true; break; }
      } catch { /* wait for server startup */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "API test server starts");

    const invalidProject = await fetch(`${baseUrl}/api/projects/not-a-uuid/background-music`);
    assert.equal(invalidProject.status, 400, "rejects invalid project IDs");
    const initial = await fetch(`${baseUrl}/api/projects/${projectId}/background-music`).then((response) => response.json());
    assert.deepEqual(initial.music, [], "new project music library is empty");

    const badForm = new FormData();
    badForm.append("music", new Blob(["not audio"], { type: "text/plain" }), "payload.txt");
    const invalidFile = await fetch(`${baseUrl}/api/projects/${projectId}/background-music`, { method: "POST", body: badForm });
    assert.equal(invalidFile.status, 400, "rejects unsupported MIME type and extension");

    const goodForm = new FormData();
    goodForm.append("music", new Blob([await fs.readFile(fixturePath)], { type: "audio/wav" }), "Calm Theme.wav");
    const upload = await fetch(`${baseUrl}/api/projects/${projectId}/background-music`, { method: "POST", body: goodForm });
    const uploaded = await upload.json();
    assert.equal(upload.status, 201, uploaded.message);
    assert.equal(uploaded.music.originalName, "Calm Theme.wav");
    assert.match(uploaded.music.filename, /^[0-9a-f-]+-Calm-Theme\.wav$/i);
    const scopedLibrary = await fetch(`${baseUrl}/api/projects/${projectId}/background-music`).then((response) => response.json());
    assert.equal(scopedLibrary.music.length, 1, "uploaded track is listed for the owning project");
    const preview = await fetch(`${baseUrl}/api/projects/${projectId}/background-music/${encodeURIComponent(uploaded.music.filename)}`);
    assert.equal(preview.status, 200, "selected track is available for same-origin preview");
    assert.match(preview.headers.get("content-type") || "", /audio\//i);
    const previewBytes = Buffer.from(await preview.arrayBuffer());
    assert.equal(previewBytes.byteLength, uploaded.music.size, "preview serves the original uploaded bytes");
    await fs.writeFile(previewPath, previewBytes);
    const decoded = await execFileAsync("ffprobe", [
      "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,duration",
      "-of", "default=noprint_wrappers=1", previewPath,
    ], { windowsHide: true, timeout: 300000 });
    assert.match(decoded.stdout, /codec_name=pcm_s16le/, "preview endpoint response remains decodable audio");
    assert.match(decoded.stdout, /duration=0\.25/, "preview endpoint preserves the uploaded audio duration");
    const traversal = await fetch(`${baseUrl}/api/projects/${projectId}/background-music/%2e%2e%2fpackage.json`);
    assert.ok([400, 404].includes(traversal.status), "rejects invalid music paths");
    const otherLibrary = await fetch(`${baseUrl}/api/projects/${otherProjectId}/background-music`).then((response) => response.json());
    assert.deepEqual(otherLibrary.music, [], "other projects cannot see uploaded tracks");

    console.log("PASS: background music API validates project IDs and MP3/WAV types, uploads safely, and lists files within their project only.");
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await fs.rm(projectDirectory, { recursive: true, force: true });
    await fs.rm(fixturePath, { force: true });
    await fs.rm(previewPath, { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL: background music upload API", error);
  process.exitCode = 1;
});
