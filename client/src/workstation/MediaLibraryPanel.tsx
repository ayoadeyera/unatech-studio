import type { ChangeEvent } from "react";
import { apiUrl } from "../api";
import type { AlignmentMediaAsset } from "../visualAlignment";
import type { NarrationSegment, Project } from "./models";

interface Props {
  project: Project;
  assets: AlignmentMediaAsset[];
  segments: NarrationSegment[];
  selectedAssets: string[];
  narrationFile: File | null;
  visualFiles: File[];
  selectedSceneId: string | null;
  uploadMessage: string;
  mediaMessage: string;
  segmentationMessage: string;
  autoPrepareMessage: string;
  uploadingNarration: boolean;
  uploadingVisual: boolean;
  segmenting: boolean;
  preparing: boolean;
  onNarrationFile: (file: File | null) => void;
  onVisualFiles: (files: File[]) => void;
  onUploadNarration: () => void;
  onUploadVisual: () => void;
  onRefresh: () => void;
  onToggleAsset: (assetId: string) => void;
  onAssignAsset: (sceneId: string, assetId: string) => void;
  onPrepare: () => void;
  onSuggestSegments: () => void;
  onUpdateSegment: (id: string, field: "startTime" | "endTime", value: number) => void;
  onSplitSegment: (id: string) => void;
  onMergeSegment: (index: number) => void;
  onAppendSlots: () => void;
}

export function MediaLibraryPanel(props: Props) {
  const {
    project, assets, segments, selectedAssets, narrationFile, visualFiles, selectedSceneId,
    uploadMessage, mediaMessage, segmentationMessage, autoPrepareMessage,
    uploadingNarration, uploadingVisual, segmenting, preparing,
    onNarrationFile, onVisualFiles, onUploadNarration, onUploadVisual, onRefresh,
    onToggleAsset, onAssignAsset, onPrepare, onSuggestSegments, onUpdateSegment, onSplitSegment,
    onMergeSegment, onAppendSlots,
  } = props;

  return (
    <div className="workstation-panel-stack">
      <section className="workstation-panel">
        <header className="workstation-panel-heading"><h2>Narration</h2><span>{project.narration ? "Ready" : "Required"}</span></header>
        {project.narration ? <p className="workstation-file-name" title={project.narration.originalName}>{project.narration.originalName}</p> : <p className="workstation-muted">Upload a narration track to build visual timing.</p>}
        <label className="workstation-file-picker">Choose MP3 or WAV
          <input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={(event: ChangeEvent<HTMLInputElement>) => onNarrationFile(event.target.files?.[0] ?? null)} />
        </label>
        {narrationFile && <button type="button" className="workstation-secondary" disabled={uploadingNarration} onClick={onUploadNarration}>{uploadingNarration ? "Uploading…" : `Upload ${narrationFile.name}`}</button>}
        {uploadMessage && <p className="workstation-status" role="status">{uploadMessage}</p>}
        <div className="workstation-divider" />
        <div className="workstation-panel-heading"><h3>Segmentation</h3><span>Optional</span></div>
        <p className="workstation-muted">FFmpeg suggests activity ranges from silence. It does not transcribe speech or infer meaning.</p>
        <button type="button" className="workstation-secondary" disabled={!project.narration || segmenting} onClick={onSuggestSegments}>{segmenting ? "Detecting silence…" : segments.length ? "Refresh suggestions" : "Suggest segments"}</button>
        {segmentationMessage && <p className="workstation-status" role="status">{segmentationMessage}</p>}
        {segments.length > 0 && <>
          <div className="workstation-segment-list">
            {segments.map((segment, index) => <article key={segment.id} className="workstation-segment-card">
              <strong>Segment {index + 1} · {segment.duration.toFixed(2)}s</strong>
              <div className="workstation-inline-fields">
                <label>Start<input type="number" min="0" step="0.01" value={segment.startTime} onChange={(event) => onUpdateSegment(segment.id, "startTime", Number(event.target.value))} /></label>
                <label>End<input type="number" min="0" step="0.01" value={segment.endTime} onChange={(event) => onUpdateSegment(segment.id, "endTime", Number(event.target.value))} /></label>
              </div>
              <div className="workstation-small-actions">
                <button type="button" disabled={segment.duration < 0.24} onClick={() => onSplitSegment(segment.id)}>Split</button>
                {index < segments.length - 1 && <button type="button" onClick={() => onMergeSegment(index)}>Merge next</button>}
              </div>
            </article>)}
          </div>
          <button type="button" className="workstation-secondary" onClick={onAppendSlots}>Append empty scene slots</button>
        </>}
      </section>
      <section className="workstation-panel">
        <header className="workstation-panel-heading"><h2>Visual library</h2><button type="button" className="workstation-text-button" onClick={onRefresh}>Refresh</button></header>
        <p className="workstation-muted">Select assets in order. Auto Prepare fills empty narration slots and preserves existing edits.</p>
        <label className="workstation-file-picker">Add image or video
          <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.mp4,image/jpeg,image/png,image/webp,video/mp4" onChange={(event: ChangeEvent<HTMLInputElement>) => onVisualFiles(Array.from(event.target.files ?? []))} />
        </label>
        {visualFiles.length > 0 && <button type="button" className="workstation-secondary" disabled={uploadingVisual} onClick={onUploadVisual}>{uploadingVisual ? "Uploading…" : `Upload ${visualFiles.length} selected file${visualFiles.length === 1 ? "" : "s"}`}</button>}
        {mediaMessage && <p className="workstation-status" role="status">{mediaMessage}</p>}
        <div className="workstation-asset-list" aria-label="Uploaded visual assets">
          {assets.map((asset) => <article key={asset.id} className={`workstation-asset ${selectedAssets.includes(asset.id) ? "is-picked" : ""}`} draggable onDragStart={(event) => { event.dataTransfer.setData("text/plain", asset.id); event.dataTransfer.effectAllowed = "copy"; }}>
            <label className="workstation-asset-pick"><input type="checkbox" checked={selectedAssets.includes(asset.id)} onChange={() => onToggleAsset(asset.id)} /> Select</label>
            {asset.mediaType === "image" ? <img src={apiUrl(asset.url)} alt={asset.originalName} loading="lazy" /> : <video src={apiUrl(asset.url)} muted preload="metadata" />}
            <span title={asset.originalName}>{asset.originalName}</span>
            <button type="button" className="workstation-text-button" disabled={!selectedSceneId} onClick={() => selectedSceneId && onAssignAsset(selectedSceneId, asset.id)}>Assign to selected scene</button>
          </article>)}
          {!assets.length && <p className="workstation-muted">No visual uploads yet.</p>}
        </div>
        <button type="button" className="workstation-primary workstation-auto-prepare" disabled={!project.narration || !assets.length || preparing} onClick={onPrepare}>{preparing ? "Preparing scenes…" : "Auto Prepare Scenes"}</button>
        {autoPrepareMessage && <p className="workstation-status" role="status">{autoPrepareMessage}</p>}
        <p className="workstation-muted">Short video clips loop to fill assigned durations. Existing populated scenes and manual edits are kept.</p>
      </section>
    </div>
  );
}
