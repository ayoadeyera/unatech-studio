import { useMemo, useState, type ReactNode } from "react";
import type { GuidedExportValidation } from "../guidedProduction";
import type { AlignmentMediaAsset } from "../visualAlignment";
import type { BackgroundMusicSettings } from "../backgroundMusic";
import type { BackgroundMusicAsset, NarrationSegment, Project, TeachingPause, VisualScene } from "./models";
import { validateSceneTiming } from "./timelineEditing";
import { WorkstationLayout } from "./WorkstationLayout";
import { MediaLibraryPanel } from "./MediaLibraryPanel";
import { PreviewPanel } from "./PreviewPanel";
import { InspectorPanel } from "./InspectorPanel";
import { WorkstationTimeline } from "./WorkstationTimeline";

interface Props {
  project: Project;
  scenes: VisualScene[];
  pauses: TeachingPause[];
  segments: NarrationSegment[];
  assets: AlignmentMediaAsset[];
  musicLibrary: BackgroundMusicAsset[];
  selectedAssets: string[];
  audioDuration: number | null;
  durationStatus: "loading" | "ready" | "unavailable";
  currentTime: number;
  activeScene: VisualScene | null;
  audioElement: ReactNode;
  musicAudioElement: ReactNode;
  monitorStatus: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  renderedVideoUrl: string | null;
  renderSeconds: number;
  validation: GuidedExportValidation;
  musicSettings: BackgroundMusicSettings;
  narrationFile: File | null;
  visualFiles: File[];
  musicFile: File | null;
  uploadMessage: string;
  mediaMessage: string;
  musicMessage: string;
  segmentationMessage: string;
  autoPrepareMessage: string;
  renderStatus: string;
  timelineMessage: string;
  uploadingNarration: boolean;
  uploadingVisual: boolean;
  uploadingMusic: boolean;
  segmenting: boolean;
  preparing: boolean;
  rendering: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onNarrationFile: (file: File | null) => void;
  onVisualFiles: (files: File[]) => void;
  onMusicFile: (file: File | null) => void;
  onUploadNarration: () => void;
  onUploadVisual: () => void;
  onUploadMusic: () => void;
  onRefreshAssets: () => void;
  onToggleAsset: (id: string) => void;
  onAutoPrepare: () => void;
  onSuggestSegments: () => void;
  onUpdateSegment: (id: string, field: "startTime" | "endTime", value: number) => void;
  onSplitSegment: (id: string) => void;
  onMergeSegment: (index: number) => void;
  onAppendSlots: () => void;
  onSeek: (time: number) => void;
  onSceneUpdate: (id: string, updates: Partial<Pick<VisualScene, "title" | "startTime" | "duration" | "mediaType" | "mediaUrl" | "originalName">>) => void;
  onSceneDelete: (id: string) => void;
  onAssignAsset: (sceneId: string, assetId: string) => void;
  onDropAsset: (sceneId: string, assetId: string) => void;
  onAddScene: () => void;
  onPauseUpdate: (id: string, updates: Partial<Pick<TeachingPause, "label" | "duration">>) => void;
  onPauseDelete: (id: string) => void;
  onAddPause: () => void;
  onJumpPause: (pause: TeachingPause) => void;
  onMusicSelect: (filename: string) => void;
  onMusicSetting: (key: keyof BackgroundMusicSettings, value: number) => void;
  onGenerate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  formatTime: (seconds: number) => string;
}

export function Workstation(props: Props) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [timingMessage, setTimingMessage] = useState("");
  const selectedScene = useMemo(
    () => props.scenes.find((scene) => scene.id === selectedSceneId) ?? props.activeScene,
    [props.activeScene, props.scenes, selectedSceneId],
  );

  function selectScene(scene: VisualScene) {
    setSelectedSceneId(scene.id);
    props.onSeek(scene.startTime);
  }

  function commitSceneTiming(sceneId: string, startTime: number, duration: number) {
    const result = validateSceneTiming(props.scenes, sceneId, startTime, duration, props.audioDuration ?? Infinity);
    if (result.valid === false) {
      setTimingMessage(result.reason);
      return;
    }
    setTimingMessage("");
    props.onSceneUpdate(sceneId, { startTime, duration });
  }

  const library = <MediaLibraryPanel
    project={props.project} assets={props.assets} segments={props.segments}
    selectedAssets={props.selectedAssets} selectedSceneId={selectedScene?.id ?? null} narrationFile={props.narrationFile}
    visualFiles={props.visualFiles} uploadMessage={props.uploadMessage}
    mediaMessage={props.mediaMessage} segmentationMessage={props.segmentationMessage}
    autoPrepareMessage={props.autoPrepareMessage} uploadingNarration={props.uploadingNarration}
    uploadingVisual={props.uploadingVisual} segmenting={props.segmenting} preparing={props.preparing}
    onNarrationFile={props.onNarrationFile} onVisualFiles={props.onVisualFiles}
    onUploadNarration={props.onUploadNarration} onUploadVisual={props.onUploadVisual}
    onRefresh={props.onRefreshAssets} onToggleAsset={props.onToggleAsset} onAssignAsset={props.onAssignAsset}
    onPrepare={props.onAutoPrepare} onSuggestSegments={props.onSuggestSegments}
    onUpdateSegment={props.onUpdateSegment} onSplitSegment={props.onSplitSegment}
    onMergeSegment={props.onMergeSegment} onAppendSlots={props.onAppendSlots}
  />;
  const preview = <PreviewPanel scene={props.activeScene} currentTime={props.currentTime}
    duration={props.audioDuration} audio={props.audioElement} musicAudio={props.musicAudioElement} monitorStatus={props.monitorStatus} renderStatus={props.renderStatus}
    videoRef={props.videoRef} renderedVideoUrl={props.renderedVideoUrl} rendering={props.rendering} renderSeconds={props.renderSeconds} />;
  const inspector = <InspectorPanel
    project={props.project} scene={selectedScene} assets={props.assets} pauses={props.pauses}
    musicLibrary={props.musicLibrary} validation={props.validation} settings={props.musicSettings}
    audioDuration={props.audioDuration} durationStatus={props.durationStatus}
    musicFile={props.musicFile} musicMessage={props.musicMessage} rendering={props.rendering}
    onMusicFile={props.onMusicFile} onUploadMusic={props.onUploadMusic} onMusicSelect={props.onMusicSelect}
    onMusicSetting={props.onMusicSetting} onSceneUpdate={props.onSceneUpdate}
    onSceneDelete={props.onSceneDelete} onAddPause={props.onAddPause}
    onUpdatePause={props.onPauseUpdate} onDeletePause={props.onPauseDelete}
    onJumpPause={props.onJumpPause} onGenerate={props.onGenerate} formatTime={props.formatTime}
  />;
  const timeline = <WorkstationTimeline
    scenes={props.scenes} pauses={props.pauses} duration={props.audioDuration ?? 0.1}
    currentTime={props.currentTime} selectedSceneId={selectedScene?.id ?? null}
    narrationName={props.project.narration?.originalName ?? ""}
    musicName={props.project.backgroundMusic?.originalName} message={timingMessage || props.timelineMessage}
    formatTime={props.formatTime} onSelectScene={selectScene} onSeek={props.onSeek}
    onCommitTiming={commitSceneTiming} onAddScene={props.onAddScene}
    onSelectPause={props.onJumpPause} onDropAsset={props.onDropAsset}
  />;

  return <WorkstationLayout title={props.project.title} savedLabel="Saved in this browser" onBack={props.onBack}
    mediaLibrary={library} preview={preview} inspector={inspector} timeline={timeline}
    canUndo={props.canUndo} canRedo={props.canRedo} onUndo={props.onUndo} onRedo={props.onRedo} />;
}
