
import { useEffect, useState } from "react";
import "./App.css";

interface HealthResponse {
  success: boolean;
  message: string;
  application: string;
  version: string;
}

function App() {
  const [apiStatus, setApiStatus] = useState("Connecting...");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const checkAPI = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/health`
        );

        if (!response.ok) {
          throw new Error("API request failed");
        }

        const data: HealthResponse = await response.json();

        setApiStatus(data.message);
        setConnected(data.success);
      } catch {
        setApiStatus("Backend connection failed");
        setConnected(false);
      }
    };

    checkAPI();
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>UnaTech Studio</h2>

        <nav>
          <a className="active" href="#dashboard">
            Dashboard
          </a>
          <a href="#projects">Projects</a>
          <a href="#editor">Video Editor</a>
          <a href="#settings">Settings</a>
        </nav>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <h1>Dashboard</h1>
          <span className="version">Studio v0.1.0</span>
        </header>

        <section className="welcome">
          <h2>Welcome to UnaTech Studio</h2>
          <p>
            Your AI-assisted video production workspace.
          </p>

          <button className="primary-button" disabled>
            + Create New Project (Coming Soon)
          </button>
        </section>

        <section className="status-card">
          <h3>System Status</h3>

          <div className="status-row">
            <span
              className={
                connected ? "status-dot online" : "status-dot offline"
              }
            />

            <div>
              <strong>
                {connected ? "Backend Connected" : "Backend Offline"}
              </strong>
              <p>{apiStatus}</p>
            </div>
          </div>
        </section>

        <section className="features">
          <h3>Production Workspace</h3>

          <div className="feature-grid">
            <article className="feature-card">
              <h4>Script Editor</h4>
              <p>Prepare your educational narration scripts.</p>
            </article>

            <article className="feature-card">
              <h4>Audio Studio</h4>
              <p>Import ElevenLabs narration and manage timing.</p>
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
      </main>
    </div>
  );
}

export default App;
