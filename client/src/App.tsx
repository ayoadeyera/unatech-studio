
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

  const [view, setView] = useState<"dashboard" | "create" | "projects">("dashboard");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [preset, setPreset] = useState<Preset>("Focused Teaching");
  const [message, setMessage] = useState("");

  const [selectedProjectId, setSelectedProjectId] =
    useState<string | null>(null);

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
                : "My Projects"}
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
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
