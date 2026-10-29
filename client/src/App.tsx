
import { useEffect, useState } from "react";
import "./App.css";

type Preset = "Focused Teaching" | "Entertaining Presenter" | "High-Energy Explainer";

interface Project {
  id: string;
  title: string;
  script: string;
  preset: Preset;
  createdAt: string;
  narration?: {
    filename: string;
    originalName: string;
    url: string;
    size: number;
  };
}

const STORAGE_KEY = "unatech-projects";

function App() {
  const [apiStatus, setApiStatus] = useState("Connecting...");
  const [connected, setConnected] = useState(false);
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const [view, setView] = useState<
    "dashboard" | "create" | "projects" | "editor"
  >("dashboard");

  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [preset, setPreset] = useState<Preset>("Focused Teaching");
  const [message, setMessage] = useState("");

  const [selectedProjectId, setSelectedProjectId] =
    useState<string | null>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  const [audioDuration, setAudioDuration] = useState<number | null>(null);

  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/health`)
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then((data) => {
        setConnected(data.success === true);
        setApiStatus(data.message);
      })
      .catch(() => {
        setConnected(false);
        setApiStatus("Backend connection failed");
      });
  }, []);

  function createProject(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setMessage("Please enter a project title.");
      return;
    }

    const project: Project = {
      id: crypto.randomUUID(),
      title: title.trim(),
      script: script.trim(),
      preset,
      createdAt: new Date().toISOString(),
    };

    const updated = [project, ...projects];
    setProjects(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    setTitle("");
    setScript("");
    setPreset("Focused Teaching");
    setMessage("Project created successfully!");
    setView("projects");
  }

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setAudioDuration(null);
    setCurrentTime(0);
    setAudioFile(null);
    setUploadMessage("");
    setMessage("");
    setView("editor");
  }

  function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "Unknown";
    }

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;

    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(remainingSeconds).padStart(2, "0");

    if (hours > 0) {
      return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    }

    return `${paddedMinutes}:${paddedSeconds}`;
  }
  async function uploadNarration() {
    if (!selectedProjectId || !audioFile || uploading) return;

    const extension = audioFile.name.split(".").pop()?.toLowerCase();

    if (extension !== "mp3" && extension !== "wav") {
      setUploadMessage("Please select an MP3 or WAV file.");
      return;
    }

    if (audioFile.size > 100 * 1024 * 1024) {
      setUploadMessage("Audio must be smaller than 100 MB.");
      return;
    }

    setUploading(true);
    setUploadMessage("Uploading narration...");

    try {
      const formData = new FormData();
      formData.append("audio", audioFile);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/projects/${selectedProjectId}/narration`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Upload failed.");
      }

      const updatedProjects = projects.map((project) =>
        project.id === selectedProjectId
          ? { ...project, narration: data.narration }
          : project
      );

      setProjects(updatedProjects);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));

      setAudioFile(null);
      setCurrentTime(0);
      setUploadMessage("Narration uploaded successfully!");
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "Upload failed."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>UnaTech Studio</h2>
        <nav>
          <button onClick={() => setView("dashboard")}>Dashboard</button>
          <button onClick={() => setView("projects")}>Projects</button>
          <button onClick={() => setView("create")}>New Project</button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <h1>
            {view === "dashboard"
              ? "Dashboard"
              : view === "create"
                ? "Create New Project"
                : view === "projects"
                  ? "My Projects"
                  : "Project Editor"}
          </h1>
          <span className="version">Studio v0.2.0</span>
        </header>

        {view === "dashboard" && (
          <>
            <section className="welcome">
              <h2>Welcome to UnaTech Studio</h2>
              <p>Your AI-assisted video production workspace.</p>
              <button className="primary-button" onClick={() => setView("create")}>
                + Create New Project
              </button>
            </section>

            <section className="status-card">
              <h3>System Status</h3>
              <div className="status-row">
                <span className={`status-dot ${connected ? "online" : "offline"}`} />
                <div>
                  <strong>{connected ? "Backend Connected" : "Backend Offline"}</strong>
                  <p>{apiStatus}</p>
                </div>
              </div>
            </section>

            <section className="features">
              <h3>Production Workspace</h3>
              <div className="feature-grid">
                <article className="feature-card">
                  <h4>Script Editor</h4>
                  <p>Prepare educational narration scripts.</p>
                </article>
                <article className="feature-card">
                  <h4>Audio Studio</h4>
                  <p>Import narration and manage timing.</p>
                </article>
                <article className="feature-card">
                  <h4>Smart Timeline</h4>
                  <p>Plan narration segments and teaching pauses.</p>
                </article>
                <article className="feature-card">
                  <h4>Visual Studio</h4>
                  <p>Build illustrations and animated code scenes.</p>
                </article>
              </div>
            </section>
          </>
        )}

        {view === "create" && (
          <section className="status-card">
            <h2>New Video Project</h2>
            <form className="project-form" onSubmit={createProject}>
              <label htmlFor="project-title">Project Title</label>
              <input
                id="project-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. JavaScript Variables Explained in Pidgin"
                required
              />

              <label htmlFor="project-script">Narration Script</label>
              <textarea
                id="project-script"
                value={script}
                onChange={(event) => setScript(event.target.value)}
                placeholder="Paste your narration script here..."
                rows={10}
              />

              <label htmlFor="production-preset">Production Preset</label>
              <select
                id="production-preset"
                value={preset}
                onChange={(event) => setPreset(event.target.value as Preset)}
              >
                <option>Focused Teaching</option>
                <option>Entertaining Presenter</option>
                <option>High-Energy Explainer</option>
              </select>

              <button className="primary-button" type="submit">
                Create Project
              </button>
            </form>
          </section>
        )}

        {view === "projects" && (
          <section>
            {message && <p role="status">{message}</p>}

            {projects.length === 0 ? (
              <div className="status-card">
                <p>No projects created yet.</p>
                <button className="primary-button" onClick={() => setView("create")}>
                  Create Your First Project
                </button>
              </div>
            ) : (
              <div className="feature-grid">
                {projects.map((project) => (
                  <article className="feature-card" key={project.id}>
                    <h3>{project.title}</h3>
                    <p>Preset: {project.preset}</p>
                    <p>Created: {new Date(project.createdAt).toLocaleDateString()}</p>
                    <p>{project.script ? `${project.script.slice(0, 120)}...` : "No script yet"}</p>
                    <button
                      className="primary-button"
                      onClick={() => openProject(project.id)}
                    >
                      Open Project
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "editor" && (
          <section className="status-card">
            <h2>Project Workspace</h2>
            <p>
              {projects.find((project) => project.id === selectedProjectId)?.title}
            </p>
            <div className="project-form">
              <h3>Audio Studio</h3>
              <p>Import your ElevenLabs narration (MP3 or WAV, maximum 100 MB).</p>

              <label htmlFor="narration-file">Select Narration</label>

              <input
                id="narration-file"
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                onChange={(event) => {
                  setAudioFile(event.target.files?.[0] || null);
                  setUploadMessage("");
                }}
              />

              <button
                className="primary-button"
                type="button"
                disabled={!audioFile || uploading}
                onClick={uploadNarration}
              >
                {uploading ? "Uploading..." : "Upload Narration"}
              </button>

              {uploadMessage && <p role="status">{uploadMessage}</p>}

              {projects
                .find((project) => project.id === selectedProjectId)
                ?.narration && (
                  <div>
                    <h4>Uploaded Narration</h4>

                    <p>
                      {
                        projects.find(
                          (project) => project.id === selectedProjectId
                        )?.narration?.originalName
                      }
                    </p>

                    <audio
                      controls
                      preload="metadata"
                      onTimeUpdate={(event) => {
                        setCurrentTime(event.currentTarget.currentTime);
                      }}
                      onSeeked={(event) => {
                        setCurrentTime(event.currentTarget.currentTime);
                      }}
                      onLoadedMetadata={(event) => {
                        const duration = event.currentTarget.duration;
                        setAudioDuration(
                          Number.isFinite(duration) ? duration : null
                        );
                      }}
                      onError={() => setAudioDuration(null)}
                      style={{ width: "100%", marginTop: "12px" }}
                      src={`${import.meta.env.VITE_API_URL}${projects.find(
                        (project) => project.id === selectedProjectId
                      )?.narration?.url
                        }`}
                    >
                      Your browser does not support audio playback.
                    </audio>

                    <div className="narration-details">

                      <p>
                        <strong>Playback Position:</strong>{" "}
                        {formatDuration(currentTime)}
                      </p>

                      <p>
                        <strong>Duration:</strong>{" "}
                        {audioDuration !== null
                          ? formatDuration(audioDuration)
                          : "Loading or unavailable"}
                      </p>

                      <p>
                        <strong>File Size:</strong>{" "}
                        {(
                          (projects.find(
                            (project) => project.id === selectedProjectId
                          )?.narration?.size ?? 0) /
                          (1024 * 1024)
                        ).toFixed(2)} MB
                      </p>
                    </div>

                    {audioDuration !== null && audioDuration > 0 && (
                      <section className="timeline-section">
                        <h3>Smart Timeline</h3>

                        <div className="timeline-labels">
                          <span>00:00</span>
                          <span>{formatDuration(audioDuration / 2)}</span>
                          <span>{formatDuration(audioDuration)}</span>
                        </div>

                        <div
                          className="timeline-track"
                          role="progressbar"
                          aria-label="Narration playback progress"
                          aria-valuemin={0}
                          aria-valuemax={audioDuration}
                          aria-valuenow={Math.min(currentTime, audioDuration)}
                        >
                          <div
                            className="timeline-progress"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, (currentTime / audioDuration) * 100)
                              )}%`,
                            }}
                          />

                          <div
                            className="timeline-playhead"
                            style={{
                              left: `${Math.min(
                                100,
                                Math.max(0, (currentTime / audioDuration) * 100)
                              )}%`,
                            }}
                          />
                        </div>

                        <p className="timeline-position">
                          Current Position: {formatDuration(currentTime)}
                        </p>
                      </section>
                    )}

                  </div>
                )}
            </div>

            <button
              className="primary-button"
              onClick={() => setView("projects")}
            >
              Back to Projects
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
