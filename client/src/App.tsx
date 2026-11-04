
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendNonOverlappingSegmentScenes, segmentCanBePlaced } from "./narrationSceneWorkflow";
import {
  createManualVisualAssignments,
  createSequentialVisualAssignments,
  planVisualAlignment,
  type AlignmentMediaAsset,
} from "./visualAlignment";
import "./App.css";

type Preset = "Focused Teaching" | "Entertaining Presenter" | "High-Energy Explainer";

interface TeachingPause {
  id: string;
  time: number;
  duration: number;
  label: string;
}

type VisualMediaType = "image" | "video";

interface NarrationSegment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
}

interface VisualScene {
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

interface Project {
  id: string;
  title: string;
  script: string;
  preset: Preset;
  createdAt: string;
  teachingPauses?: TeachingPause[];
  visualScenes?: VisualScene[];
  narrationSegments?: NarrationSegment[];
  narration?: {
    filename: string;
    originalName: string;
    url: string;
    size: number;
  };
}



const STORAGE_KEY = "unatech-projects";
const VIEW_STORAGE_KEY = "unatech-current-view";
const SELECTED_PROJECT_KEY = "unatech-selected-project";
const PLAYBACK_POSITION_PREFIX = "unatech-playback-position-";
function App() {
  const [apiStatus, setApiStatus] = useState("Connecting...");
  const [connected, setConnected] = useState(false);
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const [view, setView] = useState<
    "dashboard" | "create" | "projects" | "editor"
  >(() => {
    const savedView = localStorage.getItem(VIEW_STORAGE_KEY);

    if (
      savedView === "dashboard" ||
      savedView === "create" ||
      savedView === "projects" ||
      savedView === "editor"
    ) {
      return savedView;
    }

    return "dashboard";
  });

  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [preset, setPreset] = useState<Preset>("Focused Teaching");
  const [message, setMessage] = useState("");

  const [selectedProjectId, setSelectedProjectId] =
    useState<string | null>(() => {
      return localStorage.getItem(SELECTED_PROJECT_KEY);
    });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [segmenting, setSegmenting] = useState(false);
  const [segmentationMessage, setSegmentationMessage] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderSeconds, setRenderSeconds] = useState(0);
  const [renderMessage, setRenderMessage] = useState("");
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [visualFiles, setVisualFiles] = useState<Record<string, File>>({});
  const [uploadingSceneId, setUploadingSceneId] = useState<string | null>(null);
  const [visualUploadMessages, setVisualUploadMessages] = useState<
    Record<string, string>
  >({});
  const [visualLibrary, setVisualLibrary] = useState<AlignmentMediaAsset[]>([]);
  const [visualLibraryMessage, setVisualLibraryMessage] = useState("");
  const [alignmentMode, setAlignmentMode] = useState<"sequential" | "manual">("sequential");
  const [selectedAlignmentAssets, setSelectedAlignmentAssets] = useState<string[]>([]);
  const [manualAlignmentAssets, setManualAlignmentAssets] = useState<Record<string, string>>({});
  const [alignmentMessage, setAlignmentMessage] = useState("");

  const [audioDuration, setAudioDuration] = useState<number | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [previewSyncRevision, setPreviewSyncRevision] = useState(0);
  const [selectedPauseId, setSelectedPauseId] = useState<string | null>(null);
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId
  );



  const teachingPauses = useMemo(
    () => selectedProject?.teachingPauses ?? [],
    [selectedProject?.teachingPauses]
  );
  const visualScenes = useMemo(
    () => selectedProject?.visualScenes ?? [],
    [selectedProject?.visualScenes]
  );
  const narrationSegments = useMemo(
    () => selectedProject?.narrationSegments ?? [],
    [selectedProject?.narrationSegments]
  );
  const alignmentAssignments = useMemo(
    () => alignmentMode === "sequential"
      ? createSequentialVisualAssignments(narrationSegments, selectedAlignmentAssets)
      : createManualVisualAssignments(narrationSegments, manualAlignmentAssets),
    [alignmentMode, manualAlignmentAssets, narrationSegments, selectedAlignmentAssets],
  );
  const alignmentPreview = useMemo(
    () => planVisualAlignment(
      narrationSegments,
      alignmentAssignments,
      visualLibrary,
      visualScenes,
      (segmentId) => `preview-${segmentId}`,
    ),
    [alignmentAssignments, narrationSegments, visualLibrary, visualScenes],
  );
  const alignmentChangeCount =
    alignmentPreview.addedScenes.length + alignmentPreview.filledSlots.length;

  const orderedVisualScenes = useMemo(
    () => [...visualScenes].sort((a, b) => a.startTime - b.startTime),
    [visualScenes]
  );
  const activeVisualScene = useMemo(
    () =>
      [...orderedVisualScenes].reverse().find(
        (scene) => currentTime >= scene.startTime
      ) ?? orderedVisualScenes[0] ?? null,
    [currentTime, orderedVisualScenes]
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const visualVideoRef = useRef<HTMLVideoElement | null>(null);
  const selectedPauseCardRef = useRef<HTMLLIElement | null>(null);
  const completedPreviewPausesRef = useRef<Set<string>>(new Set());
  const teachingPauseTimerRef = useRef<number | null>(null);
  const isTeachingPauseActiveRef = useRef(false);
  const lastPreviewPositionRef = useRef(0);

  useEffect(() => {
    if (!selectedProjectId) {
      setVisualLibrary([]);
      return;
    }
    let active = true;
    setVisualLibraryMessage("Loading project media…");
    fetch(`${import.meta.env.VITE_API_URL}/api/projects/${selectedProjectId}/visuals`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success || !Array.isArray(data.media)) {
          throw new Error(data.message || "Could not load project media.");
        }
        if (!active) return;
        setVisualLibrary(data.media);
        setVisualLibraryMessage(data.media.length ? "" : "No visual uploads in this project yet.");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setVisualLibraryMessage(error instanceof Error ? error.message : "Could not load project media.");
      });
    return () => { active = false; };
  }, [selectedProjectId]);

  const refreshVisualLibrary = useCallback(async (projectId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/${projectId}/visuals`);
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.media)) throw new Error("Could not refresh project media.");
      setVisualLibrary(data.media);
      setVisualLibraryMessage(data.media.length ? "" : "No visual uploads in this project yet.");
    } catch (error) {
      setVisualLibraryMessage(error instanceof Error ? error.message : "Could not refresh project media.");
    }
  }, []);

  useEffect(() => {
    if (!rendering) return;

    const interval = window.setInterval(() => {
      setRenderSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [rendering]);

  useEffect(() => {
    const video = visualVideoRef.current;
    const audio = audioRef.current;

    if (!video || !audio || !activeVisualScene) return;

    if (activeVisualScene.mediaType !== "video") {
      video.pause();
      return;
    }

    const scenePosition = Math.max(
      0,
      audio.currentTime - activeVisualScene.startTime
    );

    const videoDuration = video.duration;

    const targetPosition = Number.isFinite(videoDuration) && videoDuration > 0
      ? scenePosition % videoDuration
      : scenePosition;

    if (
      Number.isFinite(targetPosition) &&
      video.readyState >= 1 &&
      Math.abs(video.currentTime - targetPosition) > 0.35
    ) {
      video.currentTime = targetPosition;
    }

    if (
      isTeachingPauseActiveRef.current ||
      audio.paused ||
      audio.ended
    ) {
      video.pause();
    } else {
      video.playbackRate = audio.playbackRate;

      if (video.paused) {
        video.play().catch(() => {
          // Browser may block playback.
        });
      }
    }
  }, [
    currentTime,
    previewSyncRevision,
    activeVisualScene,
  ]);

  useEffect(() => {
    if (selectedPauseId) {
      selectedPauseCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedPauseId]);
  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem(SELECTED_PROJECT_KEY, selectedProjectId);
    } else {
      localStorage.removeItem(SELECTED_PROJECT_KEY);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/health`)
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then((data) => {
        setConnected(data.success === true);
        setApiStatus(data.message);
      })
      .catch(() => {
        setConnected(false);
        setApiStatus("Backend connection failed");
      });
  }, []);

  function createProject(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setMessage("Please enter a project title.");
      return;
    }

    const project: Project = {
      id: crypto.randomUUID(),
      title: title.trim(),
      script: script.trim(),
      preset,
      createdAt: new Date().toISOString(),
      teachingPauses: [],
      visualScenes: [],
    };

    const updated = [project, ...projects];
    setProjects(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    setTitle("");
    setScript("");
    setPreset("Focused Teaching");
    setMessage("Project created successfully!");
    setView("projects");
  }

  function openProject(projectId: string) {
    completedPreviewPausesRef.current.clear();

    if (teachingPauseTimerRef.current !== null) {
      window.clearTimeout(teachingPauseTimerRef.current);
      teachingPauseTimerRef.current = null;
    }

    // Reset the teaching-pause playback lock.
    isTeachingPauseActiveRef.current = false;
    lastPreviewPositionRef.current = 0;
    
    setSelectedProjectId(projectId);
    setAudioDuration(null);
    setCurrentTime(0);
    setSelectedPauseId(null);
    setAudioFile(null);
    setUploadMessage("");
    setMessage("");
    setView("editor");
  }

  function jumpToTeachingPause(pause: TeachingPause) {
    if (!audioRef.current || audioDuration === null) {
      return;
    }

    const targetTime = Math.min(
      Math.max(0, pause.time),
      audioDuration
    );

    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    setSelectedPauseId(pause.id);
  }
  function seekToPosition(clientX: number, track: HTMLDivElement) {
    if (!audioRef.current || audioDuration === null || audioDuration <= 0) {
      return;
    }

    const bounds = track.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const percentage = Math.min(
      1,
      Math.max(0, (clientX - bounds.left) / bounds.width)
    );

    const newTime = percentage * audioDuration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }


  const handleTeachingPausePreview = useCallback((
    audio: HTMLAudioElement,
    position: number
  ) => {
    if (teachingPauseTimerRef.current !== null) return;

    const previousPosition = lastPreviewPositionRef.current;
    lastPreviewPositionRef.current = position;

    if (audio.paused || audio.ended) return;

    const pause = teachingPauses.find(
      (item) =>
        !completedPreviewPausesRef.current.has(item.id) &&
        previousPosition <= item.time &&
        position >= item.time &&
        item.duration > 0
    );

    if (!pause) return;

    completedPreviewPausesRef.current.add(pause.id);

    // Lock video playback throughout the teaching pause.
    isTeachingPauseActiveRef.current = true;

    audio.pause();

    teachingPauseTimerRef.current = window.setTimeout(() => {
      teachingPauseTimerRef.current = null;
      isTeachingPauseActiveRef.current = false;

      audio.play().catch(() => {
        // Browser playback may require user interaction.
      });
    }, pause.duration * 1000);
  }, [teachingPauses]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let frameId: number | null = null;

    const stopMonitoring = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
    };

    const monitorPlayback = () => {
      frameId = null;
      if (audio.paused || audio.ended) return;

      handleTeachingPausePreview(audio, audio.currentTime);

      if (!audio.paused && !audio.ended) {
        frameId = window.requestAnimationFrame(monitorPlayback);
      }
    };

    const startMonitoring = () => {
      if (frameId === null) {
        frameId = window.requestAnimationFrame(monitorPlayback);
      }
    };

    audio.addEventListener("play", startMonitoring);
    audio.addEventListener("pause", stopMonitoring);
    audio.addEventListener("ended", stopMonitoring);

    if (!audio.paused && !audio.ended) startMonitoring();

    return () => {
      stopMonitoring();
      audio.removeEventListener("play", startMonitoring);
      audio.removeEventListener("pause", stopMonitoring);
      audio.removeEventListener("ended", stopMonitoring);
    };
  }, [handleTeachingPausePreview, selectedProject?.narration?.url, view]);





  function addTeachingPause() {
    if (!selectedProjectId || audioDuration === null || audioDuration <= 0) {
      return;
    }

    const pause: TeachingPause = {
      id: crypto.randomUUID(),
      time: Math.min(currentTime, audioDuration),
      duration: 3,
      label: "Teaching Pause",
    };

    const updatedProjects = projects.map((project) => {
      if (project.id !== selectedProjectId) return project;

      const updatedPauses = [
        ...(project.teachingPauses ?? []),
        pause,
      ].sort((a, b) => a.time - b.time);

      return {
        ...project,
        teachingPauses: updatedPauses,
      };
    });

    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
  }

  function updateTeachingPause(
    pauseId: string,
    updates: Partial<Pick<TeachingPause, "label" | "duration">>
  ) {
    if (!selectedProjectId) return;

    const updatedProjects = projects.map((project) => {
      if (project.id !== selectedProjectId) return project;

      return {
        ...project,
        teachingPauses: (project.teachingPauses ?? []).map((pause) =>
          pause.id === pauseId ? { ...pause, ...updates } : pause
        ),
      };
    });

    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
  }

  function deleteTeachingPause(pauseId: string) {
    if (!selectedProjectId) return;
    if (selectedPauseId === pauseId) {
      setSelectedPauseId(null);
    }
    const updatedProjects = projects.map((project) => {
      if (project.id !== selectedProjectId) return project;

      return {
        ...project,
        teachingPauses: (project.teachingPauses ?? []).filter(
          (pause) => pause.id !== pauseId
        ),
      };
    });

    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
  }


  function addVisualScene() {
    if (!selectedProjectId) return;

    const scene: VisualScene = {
      id: crypto.randomUUID(),
      title: `Scene ${visualScenes.length + 1}`,
      startTime: audioDuration !== null
        ? Math.min(currentTime, audioDuration)
        : 0,
      duration: 5,
      mediaType: "image",
      mediaUrl: null,
      originalName: null,
    };

    const updatedProjects = projects.map((project) => {
      if (project.id !== selectedProjectId) return project;

      return {
        ...project,
        visualScenes: [...(project.visualScenes ?? []), scene].sort(
          (a, b) => a.startTime - b.startTime
        ),
      };
    });

    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
  }

  function updateVisualScene(
    sceneId: string,
    updates: Partial<
      Pick<VisualScene, "title" | "startTime" | "duration" | "mediaType">
    >
  ) {
    if (!selectedProjectId) return;

    const updatedProjects = projects.map((project) => {
      if (project.id !== selectedProjectId) return project;

      return {
        ...project,
        visualScenes: (project.visualScenes ?? [])
          .map((scene) =>
            scene.id === sceneId ? { ...scene, ...updates } : scene
          )
          .sort((a, b) => a.startTime - b.startTime),
      };
    });

    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
  }

  function deleteVisualScene(sceneId: string) {
    if (!selectedProjectId) return;

    const updatedProjects = projects.map((project) => {
      if (project.id !== selectedProjectId) return project;

      return {
        ...project,
        visualScenes: (project.visualScenes ?? []).filter(
          (scene) => scene.id !== sceneId
        ),
      };
    });

    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
  }

  function saveNarrationSegments(nextSegments: NarrationSegment[]) {
    if (!selectedProjectId) return;
    const updatedProjects = projects.map((project) =>
      project.id === selectedProjectId
        ? { ...project, narrationSegments: nextSegments }
        : project
    );
    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
  }

  function updateNarrationSegment(segmentId: string, field: "startTime" | "endTime", value: number) {
    if (!Number.isFinite(value) || value < 0 || (audioDuration !== null && value > audioDuration)) return;
    const segments = narrationSegments.map((segment) => {
      if (segment.id !== segmentId) return segment;
      const startTime = field === "startTime" ? value : segment.startTime;
      const endTime = field === "endTime" ? value : segment.endTime;
      if (
        endTime <= startTime ||
        !segmentCanBePlaced(narrationSegments, segment.id, startTime, endTime)
      ) {
        setSegmentationMessage("Segment boundaries cannot overlap another suggested segment.");
        return segment;
      }
      return { ...segment, startTime, endTime, duration: Number((endTime - startTime).toFixed(3)) };
    }).sort((a, b) => a.startTime - b.startTime);
    saveNarrationSegments(segments);
  }

  function mergeNarrationSegmentWithNext(index: number) {
    if (index < 0 || index >= narrationSegments.length - 1) return;
    const current = narrationSegments[index];
    const next = narrationSegments[index + 1];
    const merged: NarrationSegment = {
      id: crypto.randomUUID(),
      startTime: Math.min(current.startTime, next.startTime),
      endTime: Math.max(current.endTime, next.endTime),
      duration: Number((Math.max(current.endTime, next.endTime) - Math.min(current.startTime, next.startTime)).toFixed(3)),
    };
    saveNarrationSegments([...narrationSegments.slice(0, index), merged, ...narrationSegments.slice(index + 2)]);
  }

  function splitNarrationSegment(segmentId: string) {
    const segment = narrationSegments.find((item) => item.id === segmentId);
    if (!segment || segment.duration < 0.24) return;
    const midpoint = Number(((segment.startTime + segment.endTime) / 2).toFixed(3));
    const split = [
      { id: crypto.randomUUID(), startTime: segment.startTime, endTime: midpoint, duration: Number((midpoint - segment.startTime).toFixed(3)) },
      { id: crypto.randomUUID(), startTime: midpoint, endTime: segment.endTime, duration: Number((segment.endTime - midpoint).toFixed(3)) },
    ];
    saveNarrationSegments(narrationSegments.flatMap((item) => item.id === segmentId ? split : [item]));
  }

  async function suggestNarrationSegments() {
    if (!selectedProjectId || !selectedProject?.narration?.filename || segmenting) return;
    setSegmenting(true);
    setSegmentationMessage("Detecting silence boundaries with FFmpeg...");
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/${selectedProjectId}/narration/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioFilename: selectedProject.narration.filename }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.segments)) {
        throw new Error(data.message || "Could not detect narration segments.");
      }
      const segments: NarrationSegment[] = data.segments.map((segment: Omit<NarrationSegment, "id">) => ({
        ...segment,
        id: crypto.randomUUID(),
      }));
      saveNarrationSegments(segments);
      setSegmentationMessage(`Suggested ${segments.length} audio activity segment${segments.length === 1 ? "" : "s"}. Review and edit them before appending scene slots.`);
    } catch (error) {
      setSegmentationMessage(error instanceof Error ? error.message : "Segmentation failed.");
    } finally {
      setSegmenting(false);
    }
  }

  function appendNarrationSegmentsAsScenes() {
    if (!selectedProjectId || narrationSegments.length === 0 || !selectedProject) return;
    const existingScenes = selectedProject.visualScenes ?? [];
    const result = appendNonOverlappingSegmentScenes(
      narrationSegments,
      existingScenes,
      () => crypto.randomUUID(),
    );
    if (result.addedCount === 0) {
      setSegmentationMessage(
        result.overlapCount > 0
          ? `${result.duplicateCount} segment slot(s) already exist; ${result.overlapCount} segment(s) overlap existing scenes. No scene slots were added.`
          : `${result.duplicateCount} segment slot(s) already exist. Existing scene timing and edits were preserved; no duplicates were added.`,
      );
      return;
    }
    const updatedProjects = projects.map((project) => project.id === selectedProjectId
      ? { ...project, visualScenes: result.scenes }
      : project);
    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
    setSegmentationMessage(
      `${result.addedCount} new scene slot(s) appended; ${result.duplicateCount} existing slot(s) were kept and ${result.overlapCount} overlapping segment(s) were skipped. Existing media and manual edits were preserved. Upload media to new slots before export.`,
    );
  }

  function applyVisualAlignment() {
    if (!selectedProjectId || !selectedProject || alignmentChangeCount === 0) return;
    const result = planVisualAlignment(
      narrationSegments,
      alignmentAssignments,
      visualLibrary,
      selectedProject.visualScenes ?? [],
      () => crypto.randomUUID(),
    );
    if (result.addedScenes.length + result.filledSlots.length === 0) {
      setAlignmentMessage("No assignments were applied. Existing scenes were preserved.");
      return;
    }
    const updatedProjects = projects.map((project) => project.id === selectedProjectId
      ? { ...project, visualScenes: result.scenes as VisualScene[] }
      : project);
    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
    setAlignmentMessage(
      `Filled ${result.filledSlots.length} existing slot${result.filledSlots.length === 1 ? "" : "s"} and added ${result.addedScenes.length} new scene${result.addedScenes.length === 1 ? "" : "s"}. ${result.skipped.length} assignment${result.skipped.length === 1 ? " was" : "s were"} skipped; existing scene details and populated media were kept.`,
    );
  }

  function toggleAlignmentAsset(assetId: string) {
    setSelectedAlignmentAssets((current) => current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId]);
  }

  function alignmentSkipLabel(reason: string, conflictingSceneTitle?: string) {
    switch (reason) {
      case "no-media-selected": return "No media selected";
      case "media-not-found": return "Selected media is no longer available";
      case "already-assigned": return "This segment already has an aligned scene";
      case "duplicate-segment-slot": return "Multiple scene slots match this segment";
      case "overlaps-existing-scene": return `Overlaps existing scene${conflictingSceneTitle ? ` “${conflictingSceneTitle}”` : ""}`;
      case "scene-limit": return "Export limit of 20 scenes reached";
      case "invalid-timing": return "Invalid segment timing";
      default: return "Segment could not be placed";
    }
  }

  function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "Unknown";
    }

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;

    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(remainingSeconds).padStart(2, "0");

    if (hours > 0) {
      return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    }

    return `${paddedMinutes}:${paddedSeconds}`;
  }

  async function uploadVisualScene(scene: VisualScene) {
    if (!selectedProjectId || uploadingSceneId) return;

    const file = visualFiles[scene.id];

    if (!file) {
      setVisualUploadMessages((previous) => ({
        ...previous,
        [scene.id]: "Please select an image or video.",
      }));
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
    ];

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (
      !allowedTypes.includes(file.type) ||
      !["jpg", "jpeg", "png", "webp", "mp4"].includes(extension ?? "")
    ) {
      setVisualUploadMessages((previous) => ({
        ...previous,
        [scene.id]: "Only JPG, PNG, WebP and MP4 files are supported.",
      }));
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setVisualUploadMessages((previous) => ({
        ...previous,
        [scene.id]: "File must not exceed 100 MB.",
      }));
      return;
    }

    const projectId = selectedProjectId;
    setUploadingSceneId(scene.id);

    setVisualUploadMessages((previous) => ({
      ...previous,
      [scene.id]: "Uploading visual media...",
    }));

    try {
      const formData = new FormData();
      formData.append("visual", file);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/projects/${projectId}/visuals`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success || !data.media?.url) {
        throw new Error(data.message || "Visual upload failed.");
      }

      const updatedProjects = projects.map((project) => {
        if (project.id !== projectId) return project;

        return {
          ...project,
          visualScenes: (project.visualScenes ?? []).map((item) =>
            item.id === scene.id
              ? {
                ...item,
                mediaUrl: data.media.url as string,
                originalName: data.media.originalName as string,
                mediaType: data.media.mediaType as VisualMediaType,
              }
              : item
          ),
        };
      });

      setProjects(updatedProjects);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
      await refreshVisualLibrary(projectId);

      setVisualFiles((previous) => {
        const updated = { ...previous };
        delete updated[scene.id];
        return updated;
      });

      setVisualUploadMessages((previous) => ({
        ...previous,
        [scene.id]: "Visual media uploaded successfully!",
      }));
    } catch (error) {
      setVisualUploadMessages((previous) => ({
        ...previous,
        [scene.id]:
          error instanceof Error ? error.message : "Upload failed.",
      }));
    } finally {
      setUploadingSceneId(null);
    }
  }

  async function uploadNarration() {
    if (!selectedProjectId || !audioFile || uploading) return;

    const extension = audioFile.name.split(".").pop()?.toLowerCase();

    if (extension !== "mp3" && extension !== "wav") {
      setUploadMessage("Please select an MP3 or WAV file.");
      return;
    }

    if (audioFile.size > 100 * 1024 * 1024) {
      setUploadMessage("Audio must be smaller than 100 MB.");
      return;
    }

    setUploading(true);
    setUploadMessage("Uploading narration...");

    try {
      const formData = new FormData();
      formData.append("audio", audioFile);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/projects/${selectedProjectId}/narration`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Upload failed.");
      }

      const updatedProjects = projects.map((project) =>
        project.id === selectedProjectId
          ? { ...project, narration: data.narration, narrationSegments: [] }
          : project
      );

      setProjects(updatedProjects);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));

      setAudioFile(null);
      setCurrentTime(0);
      setUploadMessage("Narration uploaded successfully!");
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "Upload failed."
      );
    } finally {
      setUploading(false);
    }
  }


  async function generateVideo() {
    if (!selectedProject || rendering) return;

    if (!selectedProject.narration?.filename) {
      setRenderMessage("Upload narration before generating a video.");
      return;
    }

    const scenes = selectedProject.visualScenes ?? [];

    if (scenes.length < 2) {
      setRenderMessage("Add at least two visual scenes.");
      return;
    }

    if (scenes.some((scene) => !scene.mediaUrl)) {
      setRenderMessage("Upload media for every visual scene.");
      return;
    }

    setRenderSeconds(0);
    setRendering(true);
    setRenderMessage("Generating your video. Keep this page open...");
    setRenderedVideoUrl(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/projects/${selectedProject.id}/render-mixed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            audioFilename: selectedProject.narration.filename,
            scenes,
            teachingPauses: selectedProject.teachingPauses ?? [],
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success || !data.video?.url) {
        throw new Error(data.message || "Video rendering failed.");
      }

      setRenderedVideoUrl(
        `${import.meta.env.VITE_API_URL}${data.video.url}`
      );

      setRenderMessage("Video generated successfully!");
    } catch (error) {
      setRenderMessage(
        error instanceof Error
          ? error.message
          : "Unable to generate the video."
      );
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>UnaTech Studio</h2>
        <nav>
          <button onClick={() => setView("dashboard")}>Dashboard</button>
          <button onClick={() => setView("projects")}>Projects</button>
          <button onClick={() => setView("create")}>New Project</button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <h1>
            {view === "dashboard"
              ? "Dashboard"
              : view === "create"
                ? "Create New Project"
                : view === "projects"
                  ? "My Projects"
                  : "Project Editor"}
          </h1>
          <span className="version">Studio v0.2.0</span>
        </header>

        {view === "dashboard" && (
          <>
            <section className="welcome">
              <h2>Welcome to UnaTech Studio</h2>
              <p>Your AI-assisted video production workspace.</p>
              <button className="primary-button" onClick={() => setView("create")}>
                + Create New Project
              </button>
            </section>

            <section className="status-card">
              <h3>System Status</h3>
              <div className="status-row">
                <span className={`status-dot ${connected ? "online" : "offline"}`} />
                <div>
                  <strong>{connected ? "Backend Connected" : "Backend Offline"}</strong>
                  <p>{apiStatus}</p>
                </div>
              </div>
            </section>

            <section className="features">
              <h3>Production Workspace</h3>
              <div className="feature-grid">
                <article className="feature-card">
                  <h4>Script Editor</h4>
                  <p>Prepare educational narration scripts.</p>
                </article>
                <article className="feature-card">
                  <h4>Audio Studio</h4>
                  <p>Import narration and manage timing.</p>
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
          </>
        )}

        {view === "create" && (
          <section className="status-card">
            <h2>New Video Project</h2>
            <form className="project-form" onSubmit={createProject}>
              <label htmlFor="project-title">Project Title</label>
              <input
                id="project-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. JavaScript Variables Explained in Pidgin"
                required
              />

              <label htmlFor="project-script">Narration Script</label>
              <textarea
                id="project-script"
                value={script}
                onChange={(event) => setScript(event.target.value)}
                placeholder="Paste your narration script here..."
                rows={10}
              />

              <label htmlFor="production-preset">Production Preset</label>
              <select
                id="production-preset"
                value={preset}
                onChange={(event) => setPreset(event.target.value as Preset)}
              >
                <option>Focused Teaching</option>
                <option>Entertaining Presenter</option>
                <option>High-Energy Explainer</option>
              </select>

              <button className="primary-button" type="submit">
                Create Project
              </button>
            </form>
          </section>
        )}

        {view === "projects" && (
          <section>
            {message && <p role="status">{message}</p>}

            {projects.length === 0 ? (
              <div className="status-card">
                <p>No projects created yet.</p>
                <button className="primary-button" onClick={() => setView("create")}>
                  Create Your First Project
                </button>
              </div>
            ) : (
              <div className="feature-grid">
                {projects.map((project) => (
                  <article className="feature-card" key={project.id}>
                    <h3>{project.title}</h3>
                    <p>Preset: {project.preset}</p>
                    <p>Created: {new Date(project.createdAt).toLocaleDateString()}</p>
                    <p>{project.script ? `${project.script.slice(0, 120)}...` : "No script yet"}</p>
                    <button
                      className="primary-button"
                      onClick={() => openProject(project.id)}
                    >
                      Open Project
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "editor" && (
          <section className="status-card">
            <h2>Project Workspace</h2>
            <p>
              {projects.find((project) => project.id === selectedProjectId)?.title}
            </p>
            <div className="project-form">
              <h3>Audio Studio</h3>
              <p>Import your ElevenLabs narration (MP3 or WAV, maximum 100 MB).</p>

              <label htmlFor="narration-file">Select Narration</label>

              <input
                id="narration-file"
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                onChange={(event) => {
                  setAudioFile(event.target.files?.[0] || null);
                  setUploadMessage("");
                }}
              />

              <button
                className="primary-button"
                type="button"
                disabled={!audioFile || uploading}
                onClick={uploadNarration}
              >
                {uploading ? "Uploading..." : "Upload Narration"}
              </button>

              {uploadMessage && <p role="status">{uploadMessage}</p>}

              {projects
                .find((project) => project.id === selectedProjectId)
                ?.narration && (
                  <div>
                    <h4>Uploaded Narration</h4>

                    <p>
                      {
                        projects.find(
                          (project) => project.id === selectedProjectId
                        )?.narration?.originalName
                      }
                    </p>

                    <audio
                      ref={audioRef}
                      controls
                      preload="metadata"
                      onPause={(event) => {
                        setCurrentTime(event.currentTarget.currentTime);
                        setPreviewSyncRevision((revision) => revision + 1);
                      }}
                      onPlay={(event) => {
                        setCurrentTime(event.currentTarget.currentTime);
                        setPreviewSyncRevision((revision) => revision + 1);
                      }}
                      onEnded={(event) => {
                        const audio = event.currentTarget;

                        audio.currentTime = 0;
                        setCurrentTime(0);
                        lastPreviewPositionRef.current = 0;

                        if (selectedProjectId) {
                          localStorage.setItem(
                            `${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`,
                            "0"
                          );
                        }
                      }}

                      onTimeUpdate={(event) => {
                        const audio = event.currentTarget;
                        const position = audio.currentTime;

                        setCurrentTime(position);

                        if (selectedProjectId) {
                          localStorage.setItem(
                            `${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`,
                            String(position)
                          );
                        }

                      }}


                      onSeeked={(event) => {
                        const position = event.currentTarget.currentTime;
                        lastPreviewPositionRef.current = position;

                        // Reset pauses when seeking backwards.
                        for (const pause of teachingPauses) {
                          if (position < pause.time - 0.4) {
                            completedPreviewPausesRef.current.delete(pause.id);
                          }
                        }

                        setCurrentTime(position);

                        if (selectedProjectId) {
                          localStorage.setItem(
                            `${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`,
                            String(position)
                          );
                        }
                      }}

                      onLoadedMetadata={(event) => {
                        const audio = event.currentTarget;
                        const duration = audio.duration;

                        setAudioDuration(
                          Number.isFinite(duration) ? duration : null
                        );

                        if (!selectedProjectId || !Number.isFinite(duration)) {
                          return;
                        }

                        const storageKey = `${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`;
                        const savedPosition = Number(localStorage.getItem(storageKey));

                        const restoredPosition =
                          Number.isFinite(savedPosition) &&
                            savedPosition >= 0 &&
                            savedPosition < duration
                            ? savedPosition
                            : 0;

                        audio.currentTime = restoredPosition;
                        lastPreviewPositionRef.current = restoredPosition;
                        setCurrentTime(restoredPosition);

                        localStorage.setItem(
                          storageKey,
                          String(restoredPosition)
                        );
                      }}
                      onError={() => setAudioDuration(null)}
                      style={{ width: "100%", marginTop: "12px" }}
                      src={`${import.meta.env.VITE_API_URL}${projects.find(
                        (project) => project.id === selectedProjectId
                      )?.narration?.url
                        }`}
                    >
                      Your browser does not support audio playback.
                    </audio>

                    <div className="narration-details">

                      <p>
                        <strong>Playback Position:</strong>{" "}
                        {formatDuration(currentTime)}
                      </p>

                      <p>
                        <strong>Duration:</strong>{" "}
                        {audioDuration !== null
                          ? formatDuration(audioDuration)
                          : "Loading or unavailable"}
                      </p>

                      <p>
                        <strong>File Size:</strong>{" "}
                        {(
                          (projects.find(
                            (project) => project.id === selectedProjectId
                          )?.narration?.size ?? 0) /
                          (1024 * 1024)
                        ).toFixed(2)} MB
                      </p>
                    </div>

                    <section className="narration-segmentation" aria-labelledby="narration-segments-heading">
                      <h4 id="narration-segments-heading">Automatic Narration Segments</h4>
                      <p>
                        FFmpeg suggests audio activity ranges from silence boundaries. These timestamps do not include speech transcription or semantic meaning.
                      </p>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={segmenting}
                        onClick={suggestNarrationSegments}
                      >
                        {segmenting ? "Detecting boundaries..." : narrationSegments.length ? "Detect Again" : "Suggest Segments"}
                      </button>
                      {segmentationMessage && <p role="status">{segmentationMessage}</p>}
                      {narrationSegments.length > 0 && (
                        <>
                          <p>Review and adjust the suggested boundaries. Applying them appends empty, non-overlapping visual scene slots; it never replaces or changes existing scenes.</p>
                          <ul className="narration-segments-list">
                            {narrationSegments.map((segment, index) => (
                              <li className="narration-segment-card" key={segment.id}>
                                <strong>Segment {index + 1}</strong>
                                <div className="narration-segment-times">
                                  <label htmlFor={`segment-start-${segment.id}`}>Start (seconds)</label>
                                  <input
                                    id={`segment-start-${segment.id}`}
                                    type="number"
                                    min="0"
                                    max={audioDuration ?? undefined}
                                    step="0.01"
                                    value={segment.startTime}
                                    onChange={(event) => updateNarrationSegment(segment.id, "startTime", Number(event.target.value))}
                                  />
                                  <label htmlFor={`segment-end-${segment.id}`}>End (seconds)</label>
                                  <input
                                    id={`segment-end-${segment.id}`}
                                    type="number"
                                    min={segment.startTime + 0.01}
                                    max={audioDuration ?? undefined}
                                    step="0.01"
                                    value={segment.endTime}
                                    onChange={(event) => updateNarrationSegment(segment.id, "endTime", Number(event.target.value))}
                                  />
                                </div>
                                <p>Duration: {segment.duration.toFixed(3)}s</p>
                                <div className="narration-segment-actions">
                                  <button type="button" disabled={segment.duration < 0.24} onClick={() => splitNarrationSegment(segment.id)}>Split at midpoint</button>
                                  {index < narrationSegments.length - 1 && <button type="button" onClick={() => mergeNarrationSegmentWithNext(index)}>Merge with next</button>}
                                </div>
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={appendNarrationSegmentsAsScenes}
                          >
                            Append Non-overlapping Scene Slots
                          </button>
                        </>
                      )}
                    </section>

                    {audioDuration !== null && audioDuration > 0 && (
                      <section className="timeline-section">
                        <h3>Smart Timeline</h3>

                        <div className="timeline-labels">
                          <span>00:00</span>
                          <span>{formatDuration(audioDuration / 2)}</span>
                          <span>{formatDuration(audioDuration)}</span>
                        </div>

                        <div
                          className="timeline-track"
                          role="slider"
                          tabIndex={0}
                          aria-label="Narration playback position"
                          aria-valuemin={0}
                          aria-valuemax={Math.floor(audioDuration)}
                          aria-valuenow={Math.min(
                            Math.floor(currentTime),
                            Math.floor(audioDuration)
                          )}
                          aria-valuetext={formatDuration(currentTime)}
                          onClick={(event) => {
                            seekToPosition(event.clientX, event.currentTarget);
                          }}
                          onKeyDown={(event) => {
                            if (!audioRef.current) return;

                            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                              event.preventDefault();

                              const direction = event.key === "ArrowRight" ? 1 : -1;
                              const newTime = Math.min(
                                audioDuration,
                                Math.max(0, audioRef.current.currentTime + direction * 5)
                              );

                              audioRef.current.currentTime = newTime;
                              setCurrentTime(newTime);
                            }
                          }}


                        >
                          <div
                            className="timeline-progress"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, (currentTime / audioDuration) * 100)
                              )}%`,
                            }}
                          />

                          {teachingPauses.map((pause) => (
                            <button
                              key={pause.id}
                              type="button"
                              className={`teaching-pause-marker ${selectedPauseId === pause.id ? "selected" : ""
                                }`}
                              style={{
                                left: `${Math.min(
                                  100,
                                  Math.max(0, (pause.time / audioDuration) * 100)
                                )}%`,
                              }}
                              title={`${pause.label} at ${formatDuration(pause.time)} (${pause.duration}s)`}
                              aria-label={`Select ${pause.label} at ${formatDuration(pause.time)}`}
                              aria-pressed={selectedPauseId === pause.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedPauseId(pause.id);
                              }}
                            />
                          ))}

                          <div
                            className="timeline-playhead"
                            style={{
                              left: `${Math.min(
                                100,
                                Math.max(0, (currentTime / audioDuration) * 100)
                              )}%`,
                            }}
                          />
                        </div>

                        <p className="timeline-position">
                          Current Position: {formatDuration(currentTime)}
                        </p>

                        <div className="teaching-pauses">
                          <button
                            type="button"
                            className="primary-button"
                            onClick={addTeachingPause}
                          >
                            + Add Teaching Pause
                          </button>

                          <h4>Teaching Pauses ({teachingPauses.length})</h4>

                          {selectedPauseId && teachingPauses.some(
                            (pause) => pause.id === selectedPauseId
                          ) && (
                              <p className="selected-pause-message">
                                Selected: {teachingPauses.find(
                                  (pause) => pause.id === selectedPauseId
                                )?.label}
                              </p>
                            )}

                          {teachingPauses.length === 0 ? (
                            <p>No teaching pauses added yet.</p>
                          ) : (
                            <ul className="pause-list">
                              {teachingPauses.map((pause) => (
                                <li
                                  key={pause.id}
                                  ref={selectedPauseId === pause.id ? selectedPauseCardRef : null}
                                  className={`pause-item ${selectedPauseId === pause.id ? "pause-item-selected" : ""
                                    }`}
                                >
                                  <div className="pause-item-header">
                                    <strong>{formatDuration(pause.time)}</strong>

                                    <button
                                      type="button"
                                      className="pause-jump-button"
                                      onClick={() => jumpToTeachingPause(pause)}
                                      aria-label={`Jump to ${pause.label} at ${formatDuration(pause.time)}`}
                                    >
                                      Jump to Time
                                    </button>

                                    <button
                                      type="button"
                                      className="pause-delete-button"
                                      onClick={() => deleteTeachingPause(pause.id)}
                                      aria-label={`Delete pause at ${formatDuration(pause.time)}`}
                                    >
                                      Delete
                                    </button>
                                  </div>

                                  <label htmlFor={`pause-label-${pause.id}`}>
                                    Pause Label
                                  </label>

                                  <input
                                    id={`pause-label-${pause.id}`}
                                    type="text"
                                    value={pause.label}
                                    onChange={(event) =>
                                      updateTeachingPause(pause.id, {
                                        label: event.target.value,
                                      })
                                    }
                                  />

                                  <label htmlFor={`pause-duration-${pause.id}`}>
                                    Duration (seconds)
                                  </label>

                                  <input
                                    id={`pause-duration-${pause.id}`}
                                    type="number"
                                    min="1"
                                    max="60"
                                    step="1"
                                    value={pause.duration}
                                    onChange={(event) => {
                                      const duration = Number(event.target.value);

                                      if (
                                        Number.isInteger(duration) &&
                                        duration >= 1 &&
                                        duration <= 60
                                      ) {
                                        updateTeachingPause(pause.id, { duration });
                                      }
                                    }}
                                  />
                                </li>
                              ))}
                            </ul>
                          )}

                        </div>

                      </section>
                    )}

                  </div>
                )}
            </div>
            <section className="visual-scenes-section">
              <div className="alignment-panel">
                <div className="visual-scenes-header">
                  <div>
                    <h3>Project Visual Library</h3>
                    <p>Choose existing uploads from this project, then preview their timestamped scene assignments.</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => selectedProjectId && void refreshVisualLibrary(selectedProjectId)}>
                    Refresh library
                  </button>
                </div>
                {visualLibraryMessage && <p className="alignment-message" role="status">{visualLibraryMessage}</p>}
                {visualLibrary.length > 0 && (
                  <ul className="alignment-media-list">
                    {visualLibrary.map((asset) => (
                      <li key={asset.id} className="alignment-media-card">
                        {asset.mediaType === "image" ? (
                          <img src={`${import.meta.env.VITE_API_URL}${asset.url}`} alt="" />
                        ) : (
                          <video src={`${import.meta.env.VITE_API_URL}${asset.url}`} muted playsInline preload="metadata" />
                        )}
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedAlignmentAssets.includes(asset.id)}
                            onChange={() => toggleAlignmentAsset(asset.id)}
                          />
                          {alignmentMode === "sequential" && selectedAlignmentAssets.includes(asset.id)
                            ? `${selectedAlignmentAssets.indexOf(asset.id) + 1}. `
                            : ""}{asset.originalName}
                        </label>
                        <small>{asset.mediaType} · {(asset.size / (1024 * 1024)).toFixed(1)} MB</small>
                      </li>
                    ))}
                  </ul>
                )}
                <fieldset className="alignment-mode">
                  <legend>Placement mode</legend>
                  <label><input type="radio" name="alignment-mode" checked={alignmentMode === "sequential"} onChange={() => setAlignmentMode("sequential")} /> Sequential (selected order)</label>
                  <label><input type="radio" name="alignment-mode" checked={alignmentMode === "manual"} onChange={() => setAlignmentMode("manual")} /> Manual Mapping (choose per segment)</label>
                </fieldset>
                {narrationSegments.length === 0 ? (
                  <p>Create or generate narration segments in Audio Studio before aligning visuals.</p>
                ) : (
                  <>
                    {alignmentMode === "manual" && (
                      <div className="alignment-mappings">
                        {narrationSegments.map((segment, index) => (
                          <label key={segment.id}>
                            Segment {index + 1} · {formatDuration(segment.startTime)}–{formatDuration(segment.endTime)}
                            <select value={manualAlignmentAssets[segment.id] ?? ""} onChange={(event) => setManualAlignmentAssets((current) => ({ ...current, [segment.id]: event.target.value }))}>
                              <option value="">No media</option>
                              {visualLibrary.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalName} ({asset.mediaType})</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    )}
                    <h4>Assignment preview</h4>
                    <ul className="alignment-preview-list">
                      {narrationSegments.map((segment, index) => {
                        const assignment = alignmentAssignments[index];
                        const asset = visualLibrary.find((item) => item.id === assignment?.assetId);
                        const added = alignmentPreview.addedScenes.find((scene) => scene.narrationSegmentId === segment.id);
                        const filled = alignmentPreview.filledSlots.find((scene) => scene.narrationSegmentId === segment.id);
                        const skipped = alignmentPreview.skipped.find((item) => item.segmentId === segment.id);
                        const previewStart = filled?.startTime ?? segment.startTime;
                        const previewDuration = filled?.duration ?? segment.endTime - segment.startTime;
                        const previewEnd = previewStart + previewDuration;
                        return (
                          <li key={segment.id} className={added || filled ? "assignment-ready" : "assignment-skipped"}>
                            <strong>Segment {index + 1}</strong>
                            <span>{formatDuration(previewStart)}–{formatDuration(previewEnd)} · {previewDuration.toFixed(3)} sec</span>
                            <span>{asset?.originalName ?? "No media selected"}</span>
                            <span>{filled ? "Ready to fill existing scene slot" : added ? "Ready to add new scene" : alignmentSkipLabel(skipped?.reason ?? "no-media-selected", skipped?.conflictingSceneTitle)}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="alignment-render-note">Short video clips loop to fill their scene duration; the renderer preserves aspect ratio with letterboxing/pillarboxing.</p>
                    <button type="button" className="primary-button" onClick={applyVisualAlignment} disabled={alignmentChangeCount === 0}>Apply proposed scene assignments ({alignmentChangeCount})</button>
                    {alignmentMessage && <p className="alignment-message" role="status">{alignmentMessage}</p>}
                  </>
                )}
              </div>
              <div className="active-visual-scene">
                <h3>Active Visual Scene</h3>

                <p>
                  Narration position: {formatDuration(currentTime)}
                </p>
                <div className="synchronized-preview">
                  {activeVisualScene?.mediaUrl ? (
                    activeVisualScene.mediaType === "image" ? (
                      <img
                        key={activeVisualScene.id}
                        src={`${import.meta.env.VITE_API_URL}${activeVisualScene.mediaUrl}`}
                        alt={activeVisualScene.title || "Active scene"}
                      />
                    ) : (
                      <video
                        key={activeVisualScene.id}
                        ref={visualVideoRef}
                        src={`${import.meta.env.VITE_API_URL}${activeVisualScene.mediaUrl}`}
                        muted
                        playsInline
                        preload="auto"
                        onLoadedMetadata={() => {
                          const audio = audioRef.current;
                          if (!audio) return;
                          setCurrentTime(audio.currentTime);
                          setPreviewSyncRevision((revision) => revision + 1);
                        }}
                      />
                    )
                  ) : (
                    <div className="synchronized-preview-placeholder">
                      <p>
                        {activeVisualScene
                          ? "No media uploaded for this scene."
                          : "No active visual scene at this position."}
                      </p>
                    </div>
                  )}
                </div>
                {activeVisualScene ? (
                  <div className="active-scene-details">
                    <strong>{activeVisualScene.title}</strong>

                    <p>
                      Scene starts at{" "}
                      {formatDuration(activeVisualScene.startTime)}
                    </p>

                    <p>
                      Duration: {activeVisualScene.duration} seconds
                    </p>

                    <p>
                      Media type: {activeVisualScene.mediaType}
                    </p>
                  </div>
                ) : (
                  <p>No visual scene is active at this position.</p>
                )}
              </div>
              <div className="visual-scenes-header">
                <div>
                  <h3>Visual Scenes ({visualScenes.length})</h3>
                  <p>
                    Plan the images and video clips that will appear
                    alongside your narration.
                  </p>
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={addVisualScene}
                >
                  + Add Visual Scene
                </button>
              </div>

              {visualScenes.length === 0 ? (
                <p>No visual scenes added yet.</p>
              ) : (
                <ul className="visual-scenes-list">
                  {visualScenes.map((scene) => (
                    <li key={scene.id} className="visual-scene-card">
                      <div className="visual-scene-card-header">
                        <strong>{scene.title || "Untitled Scene"}</strong>

                        <button
                          type="button"
                          className="pause-delete-button"
                          onClick={() => deleteVisualScene(scene.id)}
                        >
                          Delete
                        </button>
                      </div>

                      <label htmlFor={`scene-title-${scene.id}`}>
                        Scene Title
                      </label>
                      <input
                        id={`scene-title-${scene.id}`}
                        type="text"
                        value={scene.title}
                        onChange={(event) =>
                          updateVisualScene(scene.id, {
                            title: event.target.value,
                          })
                        }
                      />

                      <label htmlFor={`scene-start-${scene.id}`}>
                        Start Time (seconds)
                      </label>
                      <input
                        id={`scene-start-${scene.id}`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={scene.startTime}
                        onChange={(event) => {
                          const value = Number(event.target.value);

                          if (Number.isFinite(value) && value >= 0) {
                            updateVisualScene(scene.id, {
                              startTime: value,
                            });
                          }
                        }}
                      />

                      <label htmlFor={`scene-duration-${scene.id}`}>
                        Duration (seconds)
                      </label>
                      <input
                        id={`scene-duration-${scene.id}`}
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={scene.duration}
                        onChange={(event) => {
                          const value = Number(event.target.value);

                          if (Number.isFinite(value) && value > 0) {
                            updateVisualScene(scene.id, {
                              duration: value,
                            });
                          }
                        }}
                      />

                      <label htmlFor={`scene-type-${scene.id}`}>
                        Media Type
                      </label>
                      <select
                        id={`scene-type-${scene.id}`}
                        value={scene.mediaType}
                        onChange={(event) =>
                          updateVisualScene(scene.id, {
                            mediaType: event.target.value as VisualMediaType,
                          })
                        }
                      >

                        <option value="image">Image</option>
                        <option value="video">Video</option>
                      </select>

                      <p className="visual-scene-summary">
                        Starts at {formatDuration(scene.startTime)} —
                        Duration: {scene.duration}s —
                        {scene.mediaType === "image" ? " Image" : " Video"}
                      </p>


                      <div className="visual-scene-upload">
                        <label htmlFor={`visual-upload-${scene.id}`}>
                          Upload Image or Video
                        </label>

                        <input
                          id={`visual-upload-${scene.id}`}
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.mp4,image/jpeg,image/png,image/webp,video/mp4"
                          onChange={(event) => {
                            const file = event.target.files?.[0];

                            if (file) {
                              setVisualFiles((previous) => ({
                                ...previous,
                                [scene.id]: file,
                              }));
                            }
                          }}
                        />

                        {visualFiles[scene.id] && (
                          <p>
                            Selected: {visualFiles[scene.id].name}
                          </p>
                        )}

                        <button
                          type="button"
                          className="primary-button"
                          disabled={
                            !visualFiles[scene.id] ||
                            uploadingSceneId !== null
                          }
                          onClick={() => uploadVisualScene(scene)}
                        >
                          {uploadingSceneId === scene.id
                            ? "Uploading..."
                            : "Upload Media"}
                        </button>

                        {visualUploadMessages[scene.id] && (
                          <p role="status">
                            {visualUploadMessages[scene.id]}
                          </p>
                        )}

                        {scene.mediaUrl && (
                          <div className="visual-scene-preview">
                            <p className="visual-scene-media-status">
                              Uploaded: {scene.originalName}
                            </p>

                            {scene.mediaType === "image" ? (
                              <img
                                src={`${import.meta.env.VITE_API_URL}${scene.mediaUrl}`}
                                alt={scene.title || "Visual scene image"}
                                loading="lazy"
                              />
                            ) : (
                              <video
                                src={`${import.meta.env.VITE_API_URL}${scene.mediaUrl}`}
                                controls
                                preload="metadata"
                                playsInline
                              >
                                Your browser does not support video playback.
                              </video>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>


            <section className="video-export-section">
              <h3>Video Export</h3>

              <p>
                Combine your narration and visual scenes into an MP4 video.
              </p>

              <button
                className="primary-button"
                onClick={generateVideo}
                disabled={rendering}
              >
                {rendering ? "Generating Video..." : "Generate Video"}
              </button>


              {rendering && (
                <div className="render-progress" role="status">
                  <p>Rendering video...</p>
                  <p>
                    Elapsed time:{" "}
                    {String(Math.floor(renderSeconds / 60)).padStart(2, "0")}:
                    {String(renderSeconds % 60).padStart(2, "0")}
                  </p>
                  <p>
                    Processing your narration and visual scenes.
                    Please keep this page open.
                  </p>
                </div>
              )}

              {renderMessage && (
                <p role="status">{renderMessage}</p>
              )}



              {renderedVideoUrl && (
                <div className="rendered-video-section">
                  <h4>Video Ready!</h4>

                  <p>
                    Your video has been generated successfully.
                    Preview it below or download the MP4 file.
                  </p>

                  <video
                    key={renderedVideoUrl}
                    className="rendered-video-player"
                    src={renderedVideoUrl}
                    controls
                    playsInline
                    preload="metadata"
                  >
                    Your browser does not support HTML5 video playback.
                  </video>

                  <a
                    className="primary-button download-video-button"
                    href={renderedVideoUrl}
                    download
                  >
                    Download MP4
                  </a>
                </div>
              )}

            </section>

            <button
              className="primary-button"
              onClick={() => setView("projects")}
            >
              Back to Projects
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
