
import { useEffect, useRef, useState } from "react";
import "./App.css";

type Preset = "Focused Teaching" | "Entertaining Presenter" | "High-Energy Explainer";

interface TeachingPause {
  id: string;
  time: number;
  duration: number;
  label: string;
}

type VisualMediaType = "image" | "video";

interface VisualScene {
  id: string;
  title: string;
  startTime: number;
  duration: number;
  mediaType: VisualMediaType;
  mediaUrl: string | null;
  originalName: string | null;
}

interface Project {
  id: string;
  title: string;
  script: string;
  preset: Preset;
  createdAt: string;
  teachingPauses?: TeachingPause[];
  visualScenes?: VisualScene[];
  narration?: {
    filename: string;
    originalName: string;
    url: string;
    size: number;
  };
}



const STORAGE_KEY = "unatech-projects";
const VIEW_STORAGE_KEY = "unatech-current-view";
const SELECTED_PROJECT_KEY = "unatech-selected-project";
const PLAYBACK_POSITION_PREFIX = "unatech-playback-position-";
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
  >(() => {
    const savedView = localStorage.getItem(VIEW_STORAGE_KEY);

    if (
      savedView === "dashboard" ||
      savedView === "create" ||
      savedView === "projects" ||
      savedView === "editor"
    ) {
      return savedView;
    }

    return "dashboard";
  });

  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [preset, setPreset] = useState<Preset>("Focused Teaching");
  const [message, setMessage] = useState("");

  const [selectedProjectId, setSelectedProjectId] =
    useState<string | null>(() => {
      return localStorage.getItem(SELECTED_PROJECT_KEY);
    });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  const [audioDuration, setAudioDuration] = useState<number | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [selectedPauseId, setSelectedPauseId] = useState<string | null>(null);
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId
  );

  const teachingPauses = selectedProject?.teachingPauses ?? [];
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedPauseCardRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (selectedPauseId) {
      selectedPauseCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedPauseId]);
  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem(SELECTED_PROJECT_KEY, selectedProjectId);
    } else {
      localStorage.removeItem(SELECTED_PROJECT_KEY);
    }
  }, [selectedProjectId]);

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
      teachingPauses: [],
      visualScenes: [],
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
    setSelectedPauseId(null);
    setAudioFile(null);
    setUploadMessage("");
    setMessage("");
    setView("editor");
  }

  function jumpToTeachingPause(pause: TeachingPause) {
    if (!audioRef.current || audioDuration === null) {
      return;
    }

    const targetTime = Math.min(
      Math.max(0, pause.time),
      audioDuration
    );

    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    setSelectedPauseId(pause.id);
  }
  function seekToPosition(clientX: number, track: HTMLDivElement) {
    if (!audioRef.current || audioDuration === null || audioDuration <= 0) {
      return;
    }

    const bounds = track.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const percentage = Math.min(
      1,
      Math.max(0, (clientX - bounds.left) / bounds.width)
    );

    const newTime = percentage * audioDuration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }
  function addTeachingPause() {
    if (!selectedProjectId || audioDuration === null || audioDuration <= 0) {
      return;
    }

    const pause: TeachingPause = {
      id: crypto.randomUUID(),
      time: Math.min(currentTime, audioDuration),
      duration: 3,
      label: "Teaching Pause",
    };

    const updatedProjects = projects.map((project) => {
      if (project.id !== selectedProjectId) return project;

      const updatedPauses = [
        ...(project.teachingPauses ?? []),
        pause,
      ].sort((a, b) => a.time - b.time);

      return {
        ...project,
        teachingPauses: updatedPauses,
      };
    });

    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
  }

  function updateTeachingPause(
    pauseId: string,
    updates: Partial<Pick<TeachingPause, "label" | "duration">>
  ) {
    if (!selectedProjectId) return;

    const updatedProjects = projects.map((project) => {
      if (project.id !== selectedProjectId) return project;

      return {
        ...project,
        teachingPauses: (project.teachingPauses ?? []).map((pause) =>
          pause.id === pauseId ? { ...pause, ...updates } : pause
        ),
      };
    });

    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
  }

  function deleteTeachingPause(pauseId: string) {
    if (!selectedProjectId) return;
    if (selectedPauseId === pauseId) {
      setSelectedPauseId(null);
    }
    const updatedProjects = projects.map((project) => {
      if (project.id !== selectedProjectId) return project;

      return {
        ...project,
        teachingPauses: (project.teachingPauses ?? []).filter(
          (pause) => pause.id !== pauseId
        ),
      };
    });

    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
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
                      ref={audioRef}
                      controls
                      preload="metadata"
                      onEnded={(event) => {
                        const audio = event.currentTarget;

                        audio.currentTime = 0;
                        setCurrentTime(0);

                        if (selectedProjectId) {
                          localStorage.setItem(
                            `${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`,
                            "0"
                          );
                        }
                      }}
                      onTimeUpdate={(event) => {
                        const position = event.currentTarget.currentTime;

                        setCurrentTime(position);

                        if (selectedProjectId) {
                          localStorage.setItem(
                            `${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`,
                            String(position)
                          );
                        }
                      }}

                      onSeeked={(event) => {
                        const position = event.currentTarget.currentTime;

                        setCurrentTime(position);

                        if (selectedProjectId) {
                          localStorage.setItem(
                            `${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`,
                            String(position)
                          );
                        }
                      }}
                      onLoadedMetadata={(event) => {
                        const audio = event.currentTarget;
                        const duration = audio.duration;

                        setAudioDuration(
                          Number.isFinite(duration) ? duration : null
                        );

                        if (!selectedProjectId || !Number.isFinite(duration)) {
                          return;
                        }

                        const storageKey = `${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`;
                        const savedPosition = Number(localStorage.getItem(storageKey));

                        const restoredPosition =
                          Number.isFinite(savedPosition) &&
                            savedPosition >= 0 &&
                            savedPosition < duration
                            ? savedPosition
                            : 0;

                        audio.currentTime = restoredPosition;
                        setCurrentTime(restoredPosition);

                        localStorage.setItem(
                          storageKey,
                          String(restoredPosition)
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
                          role="slider"
                          tabIndex={0}
                          aria-label="Narration playback position"
                          aria-valuemin={0}
                          aria-valuemax={Math.floor(audioDuration)}
                          aria-valuenow={Math.min(
                            Math.floor(currentTime),
                            Math.floor(audioDuration)
                          )}
                          aria-valuetext={formatDuration(currentTime)}
                          onClick={(event) => {
                            seekToPosition(event.clientX, event.currentTarget);
                          }}
                          onKeyDown={(event) => {
                            if (!audioRef.current) return;

                            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                              event.preventDefault();

                              const direction = event.key === "ArrowRight" ? 1 : -1;
                              const newTime = Math.min(
                                audioDuration,
                                Math.max(0, audioRef.current.currentTime + direction * 5)
                              );

                              audioRef.current.currentTime = newTime;
                              setCurrentTime(newTime);
                            }
                          }}


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

                          {teachingPauses.map((pause) => (
                            <button
                              key={pause.id}
                              type="button"
                              className={`teaching-pause-marker ${selectedPauseId === pause.id ? "selected" : ""
                                }`}
                              style={{
                                left: `${Math.min(
                                  100,
                                  Math.max(0, (pause.time / audioDuration) * 100)
                                )}%`,
                              }}
                              title={`${pause.label} at ${formatDuration(pause.time)} (${pause.duration}s)`}
                              aria-label={`Select ${pause.label} at ${formatDuration(pause.time)}`}
                              aria-pressed={selectedPauseId === pause.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedPauseId(pause.id);
                              }}
                            />
                          ))}

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

                        <div className="teaching-pauses">
                          <button
                            type="button"
                            className="primary-button"
                            onClick={addTeachingPause}
                          >
                            + Add Teaching Pause
                          </button>

                          <h4>Teaching Pauses ({teachingPauses.length})</h4>

                          {selectedPauseId && teachingPauses.some(
                            (pause) => pause.id === selectedPauseId
                          ) && (
                              <p className="selected-pause-message">
                                Selected: {teachingPauses.find(
                                  (pause) => pause.id === selectedPauseId
                                )?.label}
                              </p>
                            )}

                          {teachingPauses.length === 0 ? (
                            <p>No teaching pauses added yet.</p>
                          ) : (
                            <ul className="pause-list">
                              {teachingPauses.map((pause) => (
                                <li
                                  key={pause.id}
                                  ref={selectedPauseId === pause.id ? selectedPauseCardRef : null}
                                  className={`pause-item ${selectedPauseId === pause.id ? "pause-item-selected" : ""
                                    }`}
                                >
                                  <div className="pause-item-header">
                                    <strong>{formatDuration(pause.time)}</strong>

                                    <button
                                      type="button"
                                      className="pause-jump-button"
                                      onClick={() => jumpToTeachingPause(pause)}
                                      aria-label={`Jump to ${pause.label} at ${formatDuration(pause.time)}`}
                                    >
                                      Jump to Time
                                    </button>

                                    <button
                                      type="button"
                                      className="pause-delete-button"
                                      onClick={() => deleteTeachingPause(pause.id)}
                                      aria-label={`Delete pause at ${formatDuration(pause.time)}`}
                                    >
                                      Delete
                                    </button>
                                  </div>

                                  <label htmlFor={`pause-label-${pause.id}`}>
                                    Pause Label
                                  </label>

                                  <input
                                    id={`pause-label-${pause.id}`}
                                    type="text"
                                    value={pause.label}
                                    onChange={(event) =>
                                      updateTeachingPause(pause.id, {
                                        label: event.target.value,
                                      })
                                    }
                                  />

                                  <label htmlFor={`pause-duration-${pause.id}`}>
                                    Duration (seconds)
                                  </label>

                                  <input
                                    id={`pause-duration-${pause.id}`}
                                    type="number"
                                    min="1"
                                    max="60"
                                    step="1"
                                    value={pause.duration}
                                    onChange={(event) => {
                                      const duration = Number(event.target.value);

                                      if (
                                        Number.isInteger(duration) &&
                                        duration >= 1 &&
                                        duration <= 60
                                      ) {
                                        updateTeachingPause(pause.id, { duration });
                                      }
                                    }}
                                  />
                                </li>
                              ))}
                            </ul>
                          )}

                        </div>

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
