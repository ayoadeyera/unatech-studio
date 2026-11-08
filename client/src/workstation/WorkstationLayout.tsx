import type { ReactNode } from "react";

interface Props {
  title: string;
  savedLabel: string;
  onBack: () => void;
  mediaLibrary: ReactNode;
  preview: ReactNode;
  inspector: ReactNode;
  timeline: ReactNode;
}

export function WorkstationLayout({ title, savedLabel, onBack, mediaLibrary, preview, inspector, timeline }: Props) {
  return (
    <section className="workstation-shell" aria-label="Video workstation">
      <header className="workstation-header">
        <div>
          <button type="button" className="workstation-back" onClick={onBack}>← Projects</button>
          <h1>{title}</h1>
          <p>Narration-driven video workspace</p>
        </div>
        <span className="workstation-save-state" role="status">{savedLabel}</span>
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
