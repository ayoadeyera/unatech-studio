import type { BackgroundMusicSettings } from "../backgroundMusic";

export type VisualMediaType = "image" | "video";

export interface TeachingPause {
  id: string;
  time: number;
  duration: number;
  label: string;
}

export interface NarrationSegment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface VisualScene {
  id: string;
  title: string;
  startTime: number;
  duration: number;
  mediaType: VisualMediaType;
  mediaUrl: string | null;
  originalName: string | null;
  narrationSegmentId?: string;
  alignmentAssetId?: string;
}

export interface BackgroundMusicAsset {
  filename: string;
  originalName: string;
  size: number;
}

export interface Project {
  id: string;
  title: string;
  script: string;
  preset: "Focused Teaching" | "Entertaining Presenter" | "High-Energy Explainer";
  createdAt: string;
  teachingPauses?: TeachingPause[];
  visualScenes?: VisualScene[];
  narrationSegments?: NarrationSegment[];
  narration?: { filename: string; originalName: string; url: string; size: number };
  backgroundMusic?: { filename: string; originalName: string };
  backgroundMusicSettings?: BackgroundMusicSettings;
  guidedProduction?: { activeStep?: string; activeStage?: string };
}
