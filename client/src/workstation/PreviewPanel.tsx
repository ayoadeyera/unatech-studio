import type { ReactNode, RefObject } from "react";
import { apiUrl } from "../api";
import type { VisualScene } from "./models";

interface Props {
  scene: VisualScene | null;
  currentTime: number;
  duration: number | null;
  audio: ReactNode;
  musicAudio: ReactNode;
  monitorStatus: string;
  renderStatus: string;
  playbackMessage: string;
  narrationPlaying: boolean;
  teachingPauseActive: boolean;
  shortcutHelpOpen: boolean;
  onTogglePlayback: () => void;
  onToggleShortcutHelp: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  renderedVideoUrl: string | null;
  rendering: boolean;
  renderSeconds: number;
}

export function PreviewPanel({
  scene, currentTime, duration, audio, musicAudio, monitorStatus, renderStatus,
  playbackMessage, narrationPlaying, teachingPauseActive, shortcutHelpOpen,
  onTogglePlayback, onToggleShortcutHelp, videoRef, renderedVideoUrl, rendering, renderSeconds,
}: Props) {
  return (
    <section className="workstation-preview-panel" aria-label="Synchronized preview">
      <header className="workstation-panel-heading"><h2>Live preview</h2><span>{duration && duration > 0 ? `${Math.round(duration)}s narration` : "Waiting for narration"}</span></header>
      <div className="workstation-preview-frame" data-testid="live-preview-frame">
        {scene?.mediaUrl ? scene.mediaType === "image" ? (
          <img src={apiUrl(scene.mediaUrl)} alt={scene.title || "Active visual scene"} />
        ) : (
          <video ref={videoRef} key={scene.id} src={apiUrl(scene.mediaUrl)} muted playsInline preload="auto" />
        ) : <div className="workstation-preview-empty"><strong>{scene ? "Scene has no visual yet" : "Your 16:9 preview"}</strong><span>Upload media or use Auto Build Video to get started.</span></div>}
        <span className="workstation-preview-time">{Math.floor(currentTime / 60).toString().padStart(2, "0")}:{Math.floor(currentTime % 60).toString().padStart(2, "0")}</span>
      </div>
      {audio}
      <div className="workstation-preview-controls">
        <button
          type="button"
          className="workstation-secondary"
          onClick={onTogglePlayback}
          disabled={!duration || teachingPauseActive}
          aria-label={teachingPauseActive ? "Teaching pause in progress" : narrationPlaying ? "Pause narration" : "Play narration"}
          aria-pressed={narrationPlaying}
          title={teachingPauseActive ? "Narration resumes when the teaching pause ends" : `${narrationPlaying ? "Pause" : "Play"} narration (Space)`}
        >{teachingPauseActive ? "Teaching pause…" : narrationPlaying ? "Pause narration · Space" : "Play narration · Space"}</button>
        <button
          type="button"
          className="workstation-text-button"
          onClick={onToggleShortcutHelp}
          aria-expanded={shortcutHelpOpen}
          aria-controls="workstation-shortcut-reference"
        >Keyboard shortcuts · ?</button>
      </div>
      {shortcutHelpOpen && <aside id="workstation-shortcut-reference" className="workstation-shortcut-reference" role="dialog" aria-label="Keyboard shortcuts">
        <header><h3>Keyboard shortcuts</h3><button type="button" className="workstation-text-button" onClick={onToggleShortcutHelp} aria-label="Close keyboard shortcuts">Close</button></header>
        <dl>
          <div><dt><kbd>Space</kbd></dt><dd>Play or pause narration</dd></div>
          <div><dt><kbd>←</kbd> / <kbd>→</kbd></dt><dd>Seek 1 second</dd></div>
          <div><dt><kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd></dt><dd>Seek 5 seconds</dd></div>
          <div><dt><kbd>Home</kbd> / <kbd>End</kbd></dt><dd>Go to timeline start or end</dd></div>
          <div><dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Z</kbd></dt><dd>Undo</dd></div>
          <div><dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Y</kbd> or <kbd>Shift</kbd> + <kbd>Z</kbd></dt><dd>Redo</dd></div>
          <div><dt><kbd>?</kbd></dt><dd>Open or close this reference</dd></div>
        </dl>
        <p>Shortcuts pause while you type or use an editor control. Playback uses the narration player and keeps video, music, and teaching pauses synchronized.</p>
      </aside>}
      {musicAudio}
      {rendering && <p className="workstation-render-progress" role="status">Rendering MP4 · {String(Math.floor(renderSeconds / 60)).padStart(2, "0")}:{String(Math.floor(renderSeconds % 60)).padStart(2, "0")} elapsed</p>}
      {renderedVideoUrl && <section className="workstation-rendered-output" aria-label="Generated MP4">
        <h3>MP4 ready</h3>
        <video src={renderedVideoUrl} controls playsInline preload="metadata" />
        <a className="workstation-primary" href={renderedVideoUrl} download>Download MP4</a>
      </section>}
      {playbackMessage && <div className="workstation-preview-status workstation-preview-error" role="alert">{playbackMessage}</div>}
      <div className="workstation-preview-status" role="status">{renderStatus || monitorStatus}</div>
    </section>
  );
}
