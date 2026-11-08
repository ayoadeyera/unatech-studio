import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { TeachingPause, VisualScene } from "./models";
import { snapTimelineDelta, snapTimelineTime, shouldScrubOnPointerMove } from "./timelineEditing";

type DragMode = "move" | "trim-start" | "trim-end";
interface DragState {
  id: string;
  mode: DragMode;
  originX: number;
  originStart: number;
  originDuration: number;
  previewStart: number;
  previewDuration: number;
}

interface Props {
  scenes: VisualScene[];
  pauses: TeachingPause[];
  duration: number;
  currentTime: number;
  selectedSceneId: string | null;
  narrationName: string;
  musicName?: string;
  message: string;
  formatTime: (seconds: number) => string;
  onSelectScene: (scene: VisualScene) => void;
  onSeek: (seconds: number) => void;
  onCommitTiming: (sceneId: string, startTime: number, duration: number) => void;
  onAddScene: () => void;
  onSelectPause: (pause: TeachingPause) => void;
  onDropAsset: (sceneId: string, assetId: string) => void;
}

export function WorkstationTimeline({
  scenes, pauses, duration, currentTime, selectedSceneId, narrationName, musicName,
  message, formatTime, onSelectScene, onSeek, onCommitTiming, onAddScene, onSelectPause, onDropAsset,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState | null>(null);
  const isScrubbingRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const total = Math.max(0.1, duration);
  const widthPercent = `${zoom * 100}%`;
  const visibleTime = useMemo(() => {
    const pointer = drag ? drag.previewStart : null;
    return pointer;
  }, [drag]);
  const playhead = Math.min(100, Math.max(0, currentTime / total * 100));

  function timePercent(time: number) {
    return Math.min(100, Math.max(0, time / total * 100));
  }

  function startDrag(event: PointerEvent<HTMLElement>, scene: VisualScene, mode: DragMode) {
    event.preventDefault();
    event.stopPropagation();
    canvasRef.current?.setPointerCapture(event.pointerId);
    setDrag({
      id: scene.id, mode, originX: event.clientX, originStart: scene.startTime,
      originDuration: scene.duration, previewStart: scene.startTime,
      previewDuration: scene.duration,
    });
    onSelectScene(scene);
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag) {
      if (shouldScrubOnPointerMove(isScrubbingRef.current, false)) scrub(event);
      return;
    }
    if (!canvasRef.current) return;
    const delta = snapTimelineDelta(
      (event.clientX - drag.originX) / canvasRef.current.getBoundingClientRect().width * total,
    );
    if (drag.mode === "move") {
      const nextStart = snapTimelineTime(Math.max(0, drag.originStart + delta));
      setDrag({ ...drag, previewStart: nextStart });
    } else if (drag.mode === "trim-start") {
      const end = drag.originStart + drag.originDuration;
      const nextStart = Math.min(end - 0.25, Math.max(0, snapTimelineTime(drag.originStart + delta)));
      setDrag({ ...drag, previewStart: nextStart, previewDuration: end - nextStart });
    } else {
      const nextDuration = Math.max(0.25, snapTimelineTime(drag.originDuration + delta));
      setDrag({ ...drag, previewDuration: nextDuration });
    }
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag) {
      isScrubbingRef.current = false;
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
      return;
    }
    const moved = Math.abs(event.clientX - drag.originX) > 3;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
    if (moved) onCommitTiming(drag.id, drag.previewStart, drag.previewDuration);
    setDrag(null);
  }

  function scrub(event: PointerEvent<HTMLDivElement>) {
    if (drag || !canvasRef.current) return;
    if (event.type === "pointerdown") isScrubbingRef.current = true;
    const bounds = canvasRef.current.getBoundingClientRect();
    canvasRef.current.setPointerCapture(event.pointerId);
    onSeek(Math.min(total, Math.max(0, (event.clientX - bounds.left) / bounds.width * total)));
  }

  return (
    <section className="workstation-timeline" aria-label="Multitrack timeline">
      <header className="timeline-toolbar">
        <div><h2>Timeline</h2><span>{formatTime(duration)} total</span></div>
        <div className="timeline-zoom">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value / 1.25))}>−</button>
          <span>{zoom.toFixed(1)}×</span>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(4, value * 1.25))}>+</button>
          <button type="button" className="timeline-add-scene" onClick={onAddScene}>+ Scene</button>
        </div>
      </header>
      <div className="timeline-scroll">
        <div
          ref={canvasRef}
          className="timeline-canvas"
          style={{ width: widthPercent }}
          onPointerDown={scrub}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          onPointerCancel={() => { isScrubbingRef.current = false; setDrag(null); }}
        >
          <div className="timeline-ruler">
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <span key={fraction} style={{ left: `${fraction * 100}%` }}>{formatTime(total * fraction)}</span>
            ))}
          </div>
          <div className="timeline-lane">
            <strong>Visuals</strong>
            <div className="timeline-lane-content">
              {scenes.map((scene) => {
                const activeDrag = drag?.id === scene.id ? drag : null;
                const start = activeDrag?.previewStart ?? scene.startTime;
                const clipDuration = activeDrag?.previewDuration ?? scene.duration;
                return (
                  <div
                    key={scene.id}
                    className={`timeline-visual-clip ${selectedSceneId === scene.id ? "is-selected" : ""} ${scene.mediaUrl ? "has-media" : "is-empty"}`}
                    style={{ left: `${timePercent(start)}%`, width: `${Math.max(0.6, clipDuration / total * 100)}%` }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${scene.title}, starts ${formatTime(start)}, duration ${clipDuration.toFixed(2)} seconds`}
                    onClick={(event) => { event.stopPropagation(); onSelectScene(scene); }}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onSelectScene(scene); } }}
                    onPointerDown={(event) => startDrag(event, scene, "move")}
                    onDragOver={(event) => { if (event.dataTransfer.types.includes("text/plain")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
                    onDragEnter={(event) => { if (event.dataTransfer.types.includes("text/plain")) { event.preventDefault(); event.currentTarget.classList.add("is-drop-target"); } }}
                    onDragLeave={(event) => event.currentTarget.classList.remove("is-drop-target")}
                    onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("is-drop-target"); const assetId = event.dataTransfer.getData("text/plain"); if (assetId) onDropAsset(scene.id, assetId); }}
                  >
                    <button type="button" className="timeline-trim-handle left" aria-label={`Trim start of ${scene.title}`} onPointerDown={(event) => startDrag(event, scene, "trim-start")} onClick={(event) => event.stopPropagation()} />
                    <span>{scene.title}</span>
                    <button type="button" className="timeline-trim-handle right" aria-label={`Trim end of ${scene.title}`} onPointerDown={(event) => startDrag(event, scene, "trim-end")} onClick={(event) => event.stopPropagation()} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="timeline-lane">
            <strong>Narration</strong>
            <div className="timeline-lane-content"><div className="timeline-audio-clip">{narrationName || "Upload narration to begin"}</div></div>
          </div>
          <div className="timeline-lane">
            <strong>Music</strong>
            <div className="timeline-lane-content"><div className={`timeline-music-clip ${musicName ? "has-music" : ""}`}>{musicName || "No background music selected"}</div></div>
          </div>
          <div className="timeline-lane pause-lane">
            <strong>Teaching pauses</strong>
            <div className="timeline-lane-content">
              {pauses.map((pause) => (
                <button key={pause.id} type="button" className="timeline-pause-clip" style={{ left: `${timePercent(pause.time)}%`, width: `${Math.max(1, pause.duration / total * 100)}%` }} title={`${pause.label} · ${pause.duration}s`} onClick={(event) => { event.stopPropagation(); onSelectPause(pause); }}>
                  {pause.label}
                </button>
              ))}
            </div>
          </div>
          <div className="timeline-playhead" style={{ left: `${playhead}%` }} aria-hidden="true"><i /></div>
        </div>
      </div>
      {visibleTime !== null && <p className="timeline-edit-hint">Drag the scene body to move, or an edge to trim. Changes snap to 0.25 seconds.</p>}
      {message && <p className="timeline-message" role="status">{message}</p>}
    </section>
  );
}
