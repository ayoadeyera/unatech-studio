import type { ChangeEvent } from "react";
import type { GuidedExportValidation } from "../guidedProduction";
import type { BackgroundMusicSettings } from "../backgroundMusic";
import type { AlignmentMediaAsset } from "../visualAlignment";
import { apiUrl } from "../api";
import type { BackgroundMusicAsset, Project, TeachingPause, VisualScene } from "./models";

interface Props {
  project: Project;
  scene: VisualScene | null;
  assets: AlignmentMediaAsset[];
  pauses: TeachingPause[];
  musicLibrary: BackgroundMusicAsset[];
  validation: GuidedExportValidation;
  settings: BackgroundMusicSettings;
  audioDuration: number | null;
  durationStatus: "loading" | "ready" | "unavailable";
  musicFile: File | null;
  musicMessage: string;
  rendering: boolean;
  onMusicFile: (file: File | null) => void;
  onUploadMusic: () => void;
  onMusicSelect: (filename: string) => void;
  onMusicSetting: (key: keyof BackgroundMusicSettings, value: number) => void;
  onSceneUpdate: (id: string, updates: Partial<Pick<VisualScene, "title" | "startTime" | "duration" | "mediaType" | "mediaUrl" | "originalName">>) => void;
  onSceneDelete: (id: string) => void;
  onAddPause: () => void;
  onUpdatePause: (id: string, updates: Partial<Pick<TeachingPause, "label" | "duration">>) => void;
  onDeletePause: (id: string) => void;
  onJumpPause: (pause: TeachingPause) => void;
  onGenerate: () => void;
  formatTime: (seconds: number) => string;
}

export function InspectorPanel(props: Props) {
  const { project, scene, assets, pauses, musicLibrary, validation, settings,
    audioDuration, durationStatus, musicFile, musicMessage, rendering,
    onMusicFile, onUploadMusic, onMusicSelect, onMusicSetting, onSceneUpdate,
    onSceneDelete, onAddPause, onUpdatePause, onDeletePause, onJumpPause, onGenerate, formatTime } = props;

  return (
    <div className="workstation-panel-stack">
      <section className="workstation-panel">
        <header className="workstation-panel-heading"><h2>Inspector</h2><span>{scene ? "Scene selected" : "Project"}</span></header>
        {scene ? <>
          <label className="workstation-control">Scene title<input value={scene.title} onChange={(event) => onSceneUpdate(scene.id, { title: event.target.value })} /></label>
          <div className="workstation-inline-fields">
            <label>Start (s)<input type="number" min="0" step="0.25" value={scene.startTime} onChange={(event) => onSceneUpdate(scene.id, { startTime: Number(event.target.value) })} /></label>
            <label>Duration (s)<input type="number" min="0.25" step="0.25" value={scene.duration} onChange={(event) => onSceneUpdate(scene.id, { duration: Number(event.target.value) })} /></label>
          </div>
          <label className="workstation-control">Visual asset
            <select value={scene.mediaUrl ?? ""} onChange={(event) => {
              const asset = assets.find((item) => item.url === event.target.value);
              onSceneUpdate(scene.id, { mediaUrl: asset?.url ?? null, originalName: asset?.originalName ?? null, mediaType: asset?.mediaType ?? scene.mediaType });
            }}>
              <option value="">No media assigned</option>
              {assets.map((asset) => <option key={asset.id} value={asset.url}>{asset.originalName}</option>)}
            </select>
          </label>
          {scene.mediaUrl && <div className="inspector-asset-preview">{scene.mediaType === "image" ? <img src={apiUrl(scene.mediaUrl)} alt={scene.title} /> : <video src={apiUrl(scene.mediaUrl)} muted preload="metadata" />}</div>}
          <button type="button" className="workstation-danger-button" onClick={() => onSceneDelete(scene.id)}>Delete scene</button>
        </> : <p className="workstation-muted">Select a scene in the timeline to edit its title, media and timing.</p>}
      </section>

      <section className="workstation-panel">
        <header className="workstation-panel-heading"><h2>Audio & timing</h2><span>Focused Teaching</span></header>
        <label className="workstation-file-picker">Choose background music
          <input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={(event: ChangeEvent<HTMLInputElement>) => onMusicFile(event.target.files?.[0] ?? null)} />
        </label>
        {musicFile && <button type="button" className="workstation-secondary" onClick={onUploadMusic}>Upload {musicFile.name}</button>}
        <label className="workstation-control">Music track
          <select value={project.backgroundMusic?.filename ?? ""} onChange={(event) => onMusicSelect(event.target.value)}>
            <option value="">No background music</option>
            {musicLibrary.map((track) => <option key={track.filename} value={track.filename}>{track.originalName}</option>)}
          </select>
        </label>
        {musicMessage && <p className="workstation-status" role="status">{musicMessage}</p>}
        <div className="workstation-mixer">
          {([ ["musicVolume", "Music level"], ["narrationDuckingLevel", "Under narration"], ["teachingPauseMusicLevel", "During pauses"] ] as const).map(([key, label]) => (
            <label key={key} className="workstation-range">{label}<span>{Math.round(settings[key] * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={settings[key]} onChange={(event) => onMusicSetting(key, Number(event.target.value))} /></label>
          ))}
        </div>
        <details className="workstation-advanced-mixer"><summary>Fade and transition controls</summary>
          {([ ["fadeInDuration", "Fade in"], ["fadeOutDuration", "Fade out"], ["transitionDuration", "Pause transition"] ] as const).map(([key, label]) => (
            <label key={key} className="workstation-range">{label}<span>{settings[key].toFixed(1)}s</span><input type="range" min="0" max="10" step="0.1" value={settings[key]} onChange={(event) => onMusicSetting(key, Number(event.target.value))} /></label>
          ))}
        </details>
        <div className="workstation-divider" />
        <div className="workstation-panel-heading"><h3>Teaching pauses</h3><button type="button" className="workstation-text-button" onClick={onAddPause} disabled={audioDuration === null}>+ Add</button></div>
        {audioDuration === null && <p className="workstation-muted">{durationStatus === "loading" ? "Loading narration duration…" : "Pause editing needs a readable narration duration."}</p>}
        {pauses.map((pause) => <div className="workstation-pause-item" key={pause.id}>
          <button type="button" className="workstation-pause-time" onClick={() => onJumpPause(pause)}>{formatTime(pause.time)}</button>
          <input aria-label="Teaching pause label" value={pause.label} onChange={(event) => onUpdatePause(pause.id, { label: event.target.value })} />
          <input aria-label="Teaching pause duration" type="number" min="1" max="60" value={pause.duration} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 60) onUpdatePause(pause.id, { duration: value }); }} />
          <button type="button" className="workstation-remove-pause" aria-label={`Remove pause at ${formatTime(pause.time)}`} onClick={() => onDeletePause(pause.id)}>×</button>
        </div>)}
        <p className="workstation-muted">Live preview follows narration and pauses. Music mixing is applied to MP4 export.</p>
      </section>

      <section className="workstation-panel workstation-export-panel">
        <header className="workstation-panel-heading"><h2>Export</h2><span className={validation.ready ? "status-good" : "status-waiting"}>{validation.ready ? "Ready" : `${validation.issues.length} checks`}</span></header>
        <dl className="workstation-readiness">
          <div><dt>Narration</dt><dd>{project.narration?.originalName ?? "Missing"}{audioDuration && audioDuration > 0 ? ` · ${formatTime(audioDuration)}` : " · duration unavailable"}</dd></div>
          <div><dt>Visuals</dt><dd>{validation.populatedSceneCount}/{validation.sceneCount} scenes</dd></div>
          <div><dt>Pauses</dt><dd>{validation.pauseCount} · +{formatTime(validation.pauseDuration)}</dd></div>
          <div><dt>Music</dt><dd>{project.backgroundMusic?.originalName ?? "Off"}</dd></div>
          <div><dt>Output</dt><dd>{validation.outputDuration === null ? "Unknown" : formatTime(validation.outputDuration)}</dd></div>
        </dl>
        {validation.issues.length > 0 && <ul className="workstation-issues">{validation.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul>}
        <button type="button" className="workstation-primary workstation-generate" onClick={onGenerate} disabled={rendering || !validation.ready}>{rendering ? "Generating video…" : "Generate Video"}</button>
      </section>
    </div>
  );
}
