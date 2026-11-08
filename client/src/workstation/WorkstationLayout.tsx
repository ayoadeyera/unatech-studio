import type { ReactNode } from "react";

interface Props {
  title: string;
  savedLabel: string;
  onBack: () => void;
  mediaLibrary: ReactNode;
  preview: ReactNode;
  inspector: ReactNode;
  timeline: ReactNode;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function WorkstationLayout({ title, savedLabel, onBack, mediaLibrary, preview, inspector, timeline, canUndo, canRedo, onUndo, onRedo }: Props) {
  return (
    <section className="workstation-shell" aria-label="Video workstation">
      <header className="workstation-header">
        <div>
          <button type="button" className="workstation-back" onClick={onBack}>← Projects</button>
          <h1>{title}</h1>
          <p>Narration-driven video workspace</p>
        </div>
        <div className="workstation-header-actions">
          <span className="workstation-save-state" role="status">{savedLabel}</span>
          <button type="button" className="workstation-secondary" aria-label="Undo" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>Undo</button>
          <button type="button" className="workstation-secondary" aria-label="Redo" title="Redo (Ctrl+Y or Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo}>Redo</button>
        </div>
      </header>
      <div className="workstation-grid">
        <aside className="workstation-library" aria-label="Project media library">{mediaLibrary}</aside>
        <section className="workstation-preview-column" aria-label="Video preview">{preview}</section>
        <aside className="workstation-inspector" aria-label="Project inspector">{inspector}</aside>
        <div className="workstation-timeline-dock">{timeline}</div>
      </div>
    </section>
  );
}
