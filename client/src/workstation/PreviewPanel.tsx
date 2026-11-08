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
  videoRef: RefObject<HTMLVideoElement | null>;
  renderedVideoUrl: string | null;
  rendering: boolean;
  renderSeconds: number;
}

export function PreviewPanel({ scene, currentTime, duration, audio, musicAudio, monitorStatus, renderStatus, videoRef, renderedVideoUrl, rendering, renderSeconds }: Props) {
  return (
    <section className="workstation-preview-panel" aria-label="Synchronized preview">
      <header className="workstation-panel-heading"><h2>Live preview</h2><span>{duration && duration > 0 ? `${Math.round(duration)}s narration` : "Waiting for narration"}</span></header>
      <div className="workstation-preview-frame" data-testid="live-preview-frame">
        {scene?.mediaUrl ? scene.mediaType === "image" ? (
          <img src={apiUrl(scene.mediaUrl)} alt={scene.title || "Active visual scene"} />
        ) : (
          <video ref={videoRef} key={scene.id} src={apiUrl(scene.mediaUrl)} muted playsInline preload="auto" />
        ) : <div className="workstation-preview-empty"><strong>{scene ? "Scene has no visual yet" : "Your 16:9 preview"}</strong><span>Upload media or use Auto Prepare Scenes to get started.</span></div>}
        <span className="workstation-preview-time">{Math.floor(currentTime / 60).toString().padStart(2, "0")}:{Math.floor(currentTime % 60).toString().padStart(2, "0")}</span>
      </div>
      {audio}
      {musicAudio}
      {rendering && <p className="workstation-render-progress" role="status">Rendering MP4 · {String(Math.floor(renderSeconds / 60)).padStart(2, "0")}:{String(renderSeconds % 60).padStart(2, "0")} elapsed</p>}
      {renderedVideoUrl && <section className="workstation-rendered-output" aria-label="Generated MP4">
        <h3>MP4 ready</h3>
        <video src={renderedVideoUrl} controls playsInline preload="metadata" />
        <a className="workstation-primary" href={renderedVideoUrl} download>Download MP4</a>
      </section>}
      <div className="workstation-preview-status" role="status">{renderStatus || monitorStatus}</div>
    </section>
  );
}
