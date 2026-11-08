
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendNonOverlappingSegmentScenes, segmentCanBePlaced } from "./narrationSceneWorkflow";
import { prepareScenesAutomatically } from "./automaticScenePreparation";
import type { AlignmentMediaAsset } from "./visualAlignment";
import { DEFAULT_BACKGROUND_MUSIC_SETTINGS, type BackgroundMusicSettings } from "./backgroundMusic";
import { validateGuidedExport } from "./guidedProduction";
import { apiRequest, apiUrl } from "./api";
import type { BackgroundMusicAsset, NarrationSegment, Project, TeachingPause, VisualScene } from "./workstation/models";
import { Workstation } from "./workstation/Workstation";
import { snapTimelineTime, validateSceneTiming } from "./workstation/timelineEditing";
import { createUuid } from "./workstation/createUuid";
import { useLiveAudioMonitor } from "./workstation/useLiveAudioMonitor";
import { recordProjectEdit, snapshotProjectEdits, travelProjectEdit, type ProjectEditHistories } from "./workstation/projectEditHistory";
import { uploadVisualBatch } from "./workstation/visualBatchUpload";
import "./App.css";

type Preset = "Focused Teaching" | "Entertaining Presenter" | "High-Energy Explainer";

const STORAGE_KEY = "unatech-projects";
const VIEW_STORAGE_KEY = "unatech-current-view";
const SELECTED_PROJECT_KEY = "unatech-selected-project";
const PLAYBACK_POSITION_PREFIX = "unatech-playback-position-";
const EDIT_HISTORY_STORAGE_KEY = "unatech-project-edit-history-v1";
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
  const [projectEditHistories, setProjectEditHistories] = useState<ProjectEditHistories>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(EDIT_HISTORY_STORAGE_KEY) || "{}") as ProjectEditHistories;
      return Object.fromEntries(Object.entries(saved).map(([id, history]) => [id, { undo: history.undo ?? [], redo: history.redo ?? [] }]));
    }
    catch { return {}; }
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
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicLibrary, setMusicLibrary] = useState<BackgroundMusicAsset[]>([]);
  const [musicUploading, setMusicUploading] = useState(false);
  const [musicMessage, setMusicMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [segmenting, setSegmenting] = useState(false);
  const [segmentationMessage, setSegmentationMessage] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderSeconds, setRenderSeconds] = useState(0);
  const [renderMessage, setRenderMessage] = useState("");
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [visualLibrary, setVisualLibrary] = useState<AlignmentMediaAsset[]>([]);
  const [visualLibraryFiles, setVisualLibraryFiles] = useState<File[]>([]);
  const [visualLibraryUploading, setVisualLibraryUploading] = useState(false);
  const [timelineMessage, setTimelineMessage] = useState("");
  const [visualLibraryMessage, setVisualLibraryMessage] = useState("");
  const [selectedAlignmentAssets, setSelectedAlignmentAssets] = useState<string[]>([]);
  const [alignmentMessage, setAlignmentMessage] = useState("");
  const [preparingScenes, setPreparingScenes] = useState(false);

  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [narrationDurationStatus, setNarrationDurationStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  const [currentTime, setCurrentTime] = useState(0);
  const [previewSyncRevision, setPreviewSyncRevision] = useState(0);
  const [selectedPauseId, setSelectedPauseId] = useState<string | null>(null);
  const [previewTeachingPauseActive, setPreviewTeachingPauseActive] = useState(false);
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
  const exportValidation = useMemo(
    () => validateGuidedExport(selectedProject, audioDuration, {
      visualUrls: visualLibraryMessage === "Loading project media…"
        ? null
        : visualLibrary.map((asset) => asset.url),
      musicFilenames: musicLibrary.map((asset) => asset.filename),
    }),
    [selectedProject, audioDuration, visualLibrary, visualLibraryMessage, musicLibrary],
  );

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
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const visualVideoRef = useRef<HTMLVideoElement | null>(null);
  const selectedPauseCardRef = useRef<HTMLLIElement | null>(null);
  const completedPreviewPausesRef = useRef<Set<string>>(new Set());
  const teachingPauseTimerRef = useRef<number | null>(null);
  const teachingPauseFadeTimerRef = useRef<number | null>(null);
  const isTeachingPauseActiveRef = useRef(false);
  const lastPreviewPositionRef = useRef(0);
  const preparingScenesRef = useRef(false);

  const musicPreviewUrl = selectedProject?.backgroundMusic?.filename && selectedProjectId
    ? apiUrl(`/api/projects/${selectedProjectId}/background-music/${encodeURIComponent(selectedProject.backgroundMusic.filename)}`)
    : null;
  const liveMonitor = useLiveAudioMonitor({
    narrationRef: audioRef,
    musicRef: musicAudioRef,
    musicUrl: musicPreviewUrl,
    settings: selectedProject?.backgroundMusicSettings ?? DEFAULT_BACKGROUND_MUSIC_SETTINGS,
    teachingPause: previewTeachingPauseActive,
  });
  const musicTransitionDuration = selectedProject?.backgroundMusicSettings?.transitionDuration ?? DEFAULT_BACKGROUND_MUSIC_SETTINGS.transitionDuration;

  useEffect(() => {
    if (!selectedProjectId) return;
    let active = true;
    apiRequest<{ success: boolean; media: AlignmentMediaAsset[] }>(`/api/projects/${selectedProjectId}/visuals`)
      .then((data) => {
        if (!data.success || !Array.isArray(data.media)) throw new Error("The project media response was incomplete.");
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

  useEffect(() => {
    if (!selectedProjectId) return;
    let active = true;
    apiRequest<{ success: boolean; music: BackgroundMusicAsset[] }>(`/api/projects/${selectedProjectId}/background-music`)
      .then((data) => {
        if (!data.success || !Array.isArray(data.music)) throw new Error("The background music response was incomplete.");
        if (active) setMusicLibrary(data.music);
      })
      .catch((error: unknown) => {
        if (active) setMusicMessage(error instanceof Error ? error.message : "Could not load background music.");
      });
    return () => { active = false; };
  }, [selectedProjectId]);

  const refreshVisualLibrary = useCallback(async (projectId: string) => {
    try {
      const data = await apiRequest<{ success: boolean; media: AlignmentMediaAsset[] }>(`/api/projects/${projectId}/visuals`);
      if (!data.success || !Array.isArray(data.media)) throw new Error("The project media response was incomplete.");
      setVisualLibrary(data.media);
      setVisualLibraryMessage(data.media.length ? "" : "No visual uploads in this project yet.");
    } catch (error) {
      setVisualLibraryMessage(error instanceof Error ? error.message : "Could not refresh project media.");
    }
  }, []);

  async function uploadVisualLibraryAsset() {
    if (!selectedProjectId || !visualLibraryFiles.length || visualLibraryUploading) return;
    const invalid = visualLibraryFiles.find((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      return !["jpg", "jpeg", "png", "webp", "mp4"].includes(extension ?? "") || file.size > 100 * 1024 * 1024;
    });
    if (invalid) {
      setVisualLibraryMessage(invalid.size > 100 * 1024 * 1024
        ? `${invalid.name} is larger than 100 MB.`
        : `${invalid.name} is not a JPG, PNG, WebP, or MP4 file.`);
      return;
    }
    const files = visualLibraryFiles;
    setVisualLibraryUploading(true);
    try {
      const result = await uploadVisualBatch(files, async (file) => {
        const formData = new FormData();
        formData.append("visual", file);
        const data = await apiRequest<{ success: boolean; media?: AlignmentMediaAsset; message?: string }>(
          `/api/projects/${selectedProjectId}/visuals`, { method: "POST", body: formData },
        );
        if (!data.success || !data.media) throw new Error(data.message || "Visual upload failed.");
        return data.media;
      }, (index, file) => setVisualLibraryMessage(`Uploading ${index + 1} of ${files.length}: ${file.name}`));
      setVisualLibraryFiles([]);
      await refreshVisualLibrary(selectedProjectId);
      const failures = result.failed.map((item) => `${item.name} (${item.message})`).join(", ");
      setVisualLibraryMessage(`${result.uploaded.length} of ${files.length} visuals uploaded.${failures ? ` Failed: ${failures}.` : ""}`);
    } catch (error) {
      setVisualLibraryMessage(error instanceof Error ? error.message : "Visual upload failed.");
    } finally {
      setVisualLibraryUploading(false);
    }
  }

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
    apiRequest<{ success: boolean; message: string }>("/api/health")
      .then((data) => {
        setConnected(data.success === true);
        setApiStatus(data.message);
      })
      .catch((error: unknown) => {
        setConnected(false);
        setApiStatus(error instanceof Error ? error.message : "Backend connection failed.");
      });
  }, []);

  function createProject(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setMessage("Please enter a project title.");
      return;
    }

    const project: Project = {
      id: createUuid(),
      title: title.trim(),
      script: script.trim(),
      preset,
      createdAt: new Date().toISOString(),
      backgroundMusicSettings: { ...DEFAULT_BACKGROUND_MUSIC_SETTINGS },
      teachingPauses: [],
      visualScenes: [],
      guidedProduction: { activeStage: "narration", activeStep: "narration" },
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
    if (teachingPauseFadeTimerRef.current !== null) {
      window.clearTimeout(teachingPauseFadeTimerRef.current);
      teachingPauseFadeTimerRef.current = null;
    }

    // Reset the teaching-pause playback lock.
    isTeachingPauseActiveRef.current = false;
    setPreviewTeachingPauseActive(false);
    lastPreviewPositionRef.current = 0;
    
    setSelectedProjectId(projectId);
    setAudioDuration(null);
    setNarrationDurationStatus("loading");
    setCurrentTime(0);
    setSelectedPauseId(null);
    setAudioFile(null);
    setVisualLibraryFiles([]);
    setMusicFile(null);
    setMusicMessage("");
    setVisualLibraryMessage("Loading project media…");
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
    liveMonitor.syncTo(targetTime);
    setCurrentTime(targetTime);
    setSelectedPauseId(pause.id);
  }
  function seekToTime(time: number) {
    if (!audioRef.current || audioDuration === null || audioDuration <= 0) return;
    const nextTime = Math.min(audioDuration, Math.max(0, time));
    audioRef.current.currentTime = nextTime;
    liveMonitor.syncTo(nextTime);
    lastPreviewPositionRef.current = nextTime;
    setCurrentTime(nextTime);
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
    setPreviewTeachingPauseActive(true);

    audio.pause();

    const transitionMs = Math.min(Math.max(0, musicTransitionDuration), pause.duration) * 1000;
    teachingPauseFadeTimerRef.current = window.setTimeout(() => {
      teachingPauseFadeTimerRef.current = null;
      setPreviewTeachingPauseActive(false);
    }, Math.max(0, pause.duration * 1000 - transitionMs));

    teachingPauseTimerRef.current = window.setTimeout(() => {
      teachingPauseTimerRef.current = null;
      isTeachingPauseActiveRef.current = false;
      setPreviewTeachingPauseActive(false);
      if (teachingPauseFadeTimerRef.current !== null) {
        window.clearTimeout(teachingPauseFadeTimerRef.current);
        teachingPauseFadeTimerRef.current = null;
      }

      audio.play().catch(() => {
        // Browser playback may require user interaction.
      });
    }, pause.duration * 1000);
  }, [musicTransitionDuration, teachingPauses]);

  function recordCurrentProjectEdit(actionKey?: string) {
    if (!selectedProjectId || !selectedProject) return;
    const next = recordProjectEdit(projectEditHistories, selectedProjectId, snapshotProjectEdits(selectedProject), actionKey);
    setProjectEditHistories(next);
    localStorage.setItem(EDIT_HISTORY_STORAGE_KEY, JSON.stringify(next));
  }

  const travelCurrentProjectHistory = useCallback((direction: "undo" | "redo") => {
    if (!selectedProjectId || !selectedProject) return;
    const result = travelProjectEdit(projectEditHistories, selectedProjectId, snapshotProjectEdits(selectedProject), direction);
    if (!result.snapshot) return;
    setProjectEditHistories(result.histories);
    localStorage.setItem(EDIT_HISTORY_STORAGE_KEY, JSON.stringify(result.histories));
    const updated = projects.map((project) => project.id === selectedProjectId
      ? { ...project, visualScenes: result.snapshot!.visualScenes, teachingPauses: result.snapshot!.teachingPauses }
      : project);
    setProjects(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, [projectEditHistories, projects, selectedProject, selectedProjectId]);

  const undoCurrentProject = useCallback(() => travelCurrentProjectHistory("undo"), [travelCurrentProjectHistory]);
  const redoCurrentProject = useCallback(() => travelCurrentProjectHistory("redo"), [travelCurrentProjectHistory]);

  useEffect(() => {
    if (view !== "editor" || !selectedProjectId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undoCurrentProject();
      } else if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) {
        event.preventDefault();
        redoCurrentProject();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redoCurrentProject, selectedProjectId, undoCurrentProject, view]);

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

    recordCurrentProjectEdit();

    const pause: TeachingPause = {
      id: createUuid(),
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
    if (!teachingPauses.some((pause) => pause.id === pauseId)) return;
    recordCurrentProjectEdit(`pause:${pauseId}:${Object.keys(updates).sort().join("+")}`);

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
    if (!teachingPauses.some((pause) => pause.id === pauseId)) return;
    recordCurrentProjectEdit();
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

    const sortedScenes = [...visualScenes].sort((a, b) => a.startTime - b.startTime);
    const startTime = sortedScenes.reduce(
      (endTime, scene) => Math.max(endTime, scene.startTime + scene.duration),
      0,
    );
    if (audioDuration !== null && startTime >= audioDuration) {
      setTimelineMessage("There is no unused narration time left for another scene.");
      return;
    }

    const scene: VisualScene = {
      id: createUuid(),
      title: `Scene ${visualScenes.length + 1}`,
      startTime,
      duration: audioDuration !== null ? Math.min(5, audioDuration - startTime) : 5,
      mediaType: "image",
      mediaUrl: null,
      originalName: null,
    };

    recordCurrentProjectEdit();

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
      Pick<VisualScene, "title" | "startTime" | "duration" | "mediaType" | "mediaUrl" | "originalName">
    >
  ) {
    if (!selectedProjectId) return;

    const currentScene = visualScenes.find((scene) => scene.id === sceneId);
    if (!currentScene) return;
    let normalizedUpdates = updates;
    if (updates.startTime !== undefined || updates.duration !== undefined) {
      const startTime = snapTimelineTime(updates.startTime ?? currentScene.startTime);
      const duration = snapTimelineTime(updates.duration ?? currentScene.duration);
      const validation = validateSceneTiming(visualScenes, sceneId, startTime, duration, audioDuration ?? Infinity);
      if (validation.valid === false) {
        setTimelineMessage(validation.reason);
        return;
      }
      setTimelineMessage("");
      normalizedUpdates = { ...updates, startTime, duration };
    }
    if (Object.keys(normalizedUpdates).length) {
      recordCurrentProjectEdit(`scene:${sceneId}:${Object.keys(normalizedUpdates).sort().join("+")}`);
    }

    const updatedProjects = projects.map((project) => {
      if (project.id !== selectedProjectId) return project;

      return {
        ...project,
        visualScenes: (project.visualScenes ?? [])
          .map((scene) =>
            scene.id === sceneId ? { ...scene, ...normalizedUpdates } : scene
          )
          .sort((a, b) => a.startTime - b.startTime),
      };
    });

    setProjects(updatedProjects);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
  }

  function deleteVisualScene(sceneId: string) {
    if (!selectedProjectId) return;
    if (!visualScenes.some((scene) => scene.id === sceneId)) return;
    recordCurrentProjectEdit();

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

  function assignVisualAsset(sceneId: string, assetId: string) {
    const asset = visualLibrary.find((item) => item.id === assetId);
    if (!asset) return;
    updateVisualScene(sceneId, { mediaType: asset.mediaType, mediaUrl: asset.url, originalName: asset.originalName });
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
      id: createUuid(),
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
      { id: createUuid(), startTime: segment.startTime, endTime: midpoint, duration: Number((midpoint - segment.startTime).toFixed(3)) },
      { id: createUuid(), startTime: midpoint, endTime: segment.endTime, duration: Number((segment.endTime - midpoint).toFixed(3)) },
    ];
    saveNarrationSegments(narrationSegments.flatMap((item) => item.id === segmentId ? split : [item]));
  }

  async function suggestNarrationSegments() {
    if (!selectedProjectId || !selectedProject?.narration?.filename || segmenting) return;
    setSegmenting(true);
    setSegmentationMessage("Detecting silence boundaries with FFmpeg...");
    try {
      const data = await apiRequest<{ success: boolean; segments: Array<Omit<NarrationSegment, "id">>; message?: string }>(`/api/projects/${selectedProjectId}/narration/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioFilename: selectedProject.narration.filename }),
      });
      if (!data.success || !Array.isArray(data.segments)) {
        throw new Error(data.message || "The narration segmentation response was incomplete.");
      }
      const segments: NarrationSegment[] = data.segments.map((segment: Omit<NarrationSegment, "id">) => ({
        ...segment,
        id: createUuid(),
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
      () => createUuid(),
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

  async function prepareScenesAutomaticallyNow() {
    if (preparingScenesRef.current || !selectedProjectId || !selectedProject) return;
    preparingScenesRef.current = true;
    setPreparingScenes(true);
    setAlignmentMessage("");
    try {
      if (!selectedProject.narration?.filename) {
        setAlignmentMessage("Upload narration in Stage 1 before preparing scenes.");
        return;
      }
      if (visualLibraryMessage === "Loading project media…") {
        setAlignmentMessage("Project visual uploads are still loading. Try again when the library is ready.");
        return;
      }
      if (visualLibrary.length === 0 && visualLibraryMessage !== "No visual uploads in this project yet.") {
        setAlignmentMessage(`Could not confirm the project visual library. ${visualLibraryMessage || "Refresh the library and try again."}`);
        return;
      }

      let segments = selectedProject.narrationSegments ?? [];
      if (segments.length === 0) {
        setAlignmentMessage("No narration segments found. Detecting silence boundaries with FFmpeg…");
        const data = await apiRequest<{ success: boolean; segments: Array<Omit<NarrationSegment, "id">>; message?: string }>(`/api/projects/${selectedProjectId}/narration/segments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioFilename: selectedProject.narration.filename }),
        });
        if (!data.success || !Array.isArray(data.segments)) {
          throw new Error(data.message || "FFmpeg could not return narration segments.");
        }
        segments = data.segments.map((segment) => ({ ...segment, id: createUuid() }));
      }
      if (segments.length === 0) {
        setAlignmentMessage("No narration activity segments were found. Review the narration or create segments manually in Stage 1.");
        return;
      }

      const result = prepareScenesAutomatically(
        segments,
        selectedAlignmentAssets,
        visualLibrary,
        selectedProject.visualScenes ?? [],
        (segmentId) => `scene-${segmentId}-${createUuid()}`,
      );
      if (!result.changed && segments === (selectedProject.narrationSegments ?? [])) {
        setAlignmentMessage(
          `${result.createdCount} scene slots created · ${result.assignedCount} assets assigned · ${result.preservedCount} existing scenes preserved · ${result.skippedCount} assignments skipped. ${result.skippedCount > 0 ? "Existing media, timing and edits were kept; review segment timing or refresh/select available uploads." : "No changes were needed."}`,
        );
        return;
      }
      const updatedProjects = projects.map((project) => project.id === selectedProjectId
        ? { ...project, narrationSegments: segments, visualScenes: result.scenes as VisualScene[] }
        : project);
      setProjects(updatedProjects);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
      const warnings = [
        selectedAlignmentAssets.length === 0 ? "No assets selected; empty scene slots may remain." : "",
        result.skippedCount > 0 ? "Some assignments were skipped because media was unavailable, timing conflicted, or scenes were already populated." : "",
      ].filter(Boolean).join(" ");
      setAlignmentMessage(
        `${result.createdCount} scene slots created · ${result.assignedCount} assets assigned · ${result.preservedCount} existing scenes preserved · ${result.skippedCount} assignments skipped.${warnings ? ` ${warnings}` : " Review the scenes before export."}`,
      );
    } catch (error) {
      setAlignmentMessage(error instanceof Error ? `Automatic preparation failed: ${error.message}` : "Automatic scene preparation failed. Check the narration and visual library, then try again.");
    } finally {
      preparingScenesRef.current = false;
      setPreparingScenes(false);
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

  function updateProjectMusic(
    patch: Partial<Pick<Project, "backgroundMusic" | "backgroundMusicSettings">>,
  ) {
    if (!selectedProjectId) return;
    const updated = projects.map((project) =>
      project.id === selectedProjectId ? { ...project, ...patch } : project,
    );
    setProjects(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function updateMusicSetting(key: keyof BackgroundMusicSettings, value: number) {
    const settings = selectedProject?.backgroundMusicSettings ?? DEFAULT_BACKGROUND_MUSIC_SETTINGS;
    updateProjectMusic({ backgroundMusicSettings: { ...settings, [key]: value } });
  }

  async function uploadBackgroundMusic() {
    if (!selectedProjectId || !musicFile || musicUploading) return;
    const extension = musicFile.name.split(".").pop()?.toLowerCase();
    if (extension !== "mp3" && extension !== "wav") {
      setMusicMessage("Choose an MP3 or WAV audio file.");
      return;
    }
    if (musicFile.size > 100 * 1024 * 1024) {
      setMusicMessage("Background music must be smaller than 100 MB.");
      return;
    }

    setMusicUploading(true);
    setMusicMessage("Uploading background music...");
    try {
      const formData = new FormData();
      formData.append("music", musicFile);
      const data = await apiRequest<{ success: boolean; message?: string; music?: BackgroundMusicAsset }>(
        `/api/projects/${selectedProjectId}/background-music`,
        { method: "POST", body: formData },
      );
      if (!data.success || !data.music) {
        throw new Error(data.message || "Background music upload failed.");
      }
      const asset: BackgroundMusicAsset = data.music;
      setMusicLibrary((previous) => [asset, ...previous.filter((item) => item.filename !== asset.filename)]);
      updateProjectMusic({ backgroundMusic: { filename: asset.filename, originalName: asset.originalName } });
      setMusicFile(null);
      setMusicMessage(`Uploaded and selected ${asset.originalName}. Live mix is monitored in preview and finalized with FFmpeg on export.`);
    } catch (error) {
      setMusicMessage(error instanceof Error ? error.message : "Background music upload failed.");
    } finally {
      setMusicUploading(false);
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

      const data = await apiRequest<{ success: boolean; message?: string; narration?: NonNullable<Project["narration"]> }>(
        `/api/projects/${selectedProjectId}/narration`,
        { method: "POST", body: formData },
      );

      if (!data.success || !data.narration) {
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
      setAudioDuration(null);
      setNarrationDurationStatus("loading");
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
    if (!exportValidation.ready) {
      setRenderMessage(`Resolve these items before export: ${exportValidation.issues.map((issue) => issue.message).join(" ")}`);
      return;
    }

    const scenes = selectedProject.visualScenes ?? [];

    setRenderSeconds(0);
    setRendering(true);
    setRenderMessage("Generating your video. Keep this page open...");
    setRenderedVideoUrl(null);

    try {
      const data = await apiRequest<{ success: boolean; message?: string; video?: { url?: string } }>(
        `/api/projects/${selectedProject.id}/render-mixed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            audioFilename: selectedProject.narration.filename,
            scenes,
            teachingPauses: selectedProject.teachingPauses ?? [],
            backgroundMusicFilename: selectedProject.backgroundMusic?.filename,
            backgroundMusicSettings: selectedProject.backgroundMusic
              ? (selectedProject.backgroundMusicSettings ?? DEFAULT_BACKGROUND_MUSIC_SETTINGS)
              : undefined,
          }),
        },
      );

      if (!data.success || !data.video?.url) {
        throw new Error(data.message || "Video rendering failed.");
      }

      setRenderedVideoUrl(apiUrl(data.video.url));

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

  const narrationAudioElement = selectedProject?.narration ? (
    <audio
      ref={audioRef}
      crossOrigin="anonymous"
      controls
      preload="metadata"
      onPause={(event) => { liveMonitor.onNarrationPause(isTeachingPauseActiveRef.current); setCurrentTime(event.currentTarget.currentTime); setPreviewSyncRevision((revision) => revision + 1); }}
      onPlay={(event) => { liveMonitor.onNarrationPlay(); liveMonitor.syncTo(event.currentTarget.currentTime); setCurrentTime(event.currentTarget.currentTime); setPreviewSyncRevision((revision) => revision + 1); }}
      onEnded={(event) => {
        liveMonitor.onNarrationEnded();
        event.currentTarget.currentTime = 0;
        setCurrentTime(0);
        lastPreviewPositionRef.current = 0;
        if (selectedProjectId) localStorage.setItem(`${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`, "0");
      }}
      onTimeUpdate={(event) => {
        const position = event.currentTarget.currentTime;
        setCurrentTime(position);
        if (selectedProjectId) localStorage.setItem(`${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`, String(position));
      }}
      onSeeked={(event) => {
        const position = event.currentTarget.currentTime;
        lastPreviewPositionRef.current = position;
        liveMonitor.syncTo(position);
        for (const pause of teachingPauses) if (position < pause.time - 0.4) completedPreviewPausesRef.current.delete(pause.id);
        setCurrentTime(position);
        if (selectedProjectId) localStorage.setItem(`${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`, String(position));
      }}
      onLoadedMetadata={(event) => {
        const audio = event.currentTarget;
        const validDuration = Number.isFinite(audio.duration) && audio.duration > 0;
        setAudioDuration(validDuration ? audio.duration : null);
        setNarrationDurationStatus(validDuration ? "ready" : "unavailable");
        if (!selectedProjectId || !validDuration) return;
        const key = `${PLAYBACK_POSITION_PREFIX}${selectedProjectId}`;
        const savedPosition = Number(localStorage.getItem(key));
        const restored = Number.isFinite(savedPosition) && savedPosition >= 0 && savedPosition < audio.duration ? savedPosition : 0;
        audio.currentTime = restored;
        lastPreviewPositionRef.current = restored;
        setCurrentTime(restored);
        localStorage.setItem(key, String(restored));
      }}
      onError={() => { setAudioDuration(null); setNarrationDurationStatus("unavailable"); }}
      src={apiUrl(selectedProject.narration.url)}
    >Your browser does not support narration playback.</audio>
  ) : <div className="workstation-preview-empty">Upload narration to preview this project.</div>;
  const musicAudioElement = musicPreviewUrl
    ? <audio ref={musicAudioRef} crossOrigin="anonymous" loop preload="auto" hidden aria-hidden="true" />
    : null;

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
        {view !== "editor" && <header className="topbar">
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
        </header>}

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

        {view === "editor" && selectedProject && (
          <Workstation
            project={selectedProject}
            scenes={visualScenes}
            pauses={teachingPauses}
            segments={narrationSegments}
            assets={visualLibrary}
            musicLibrary={musicLibrary}
            selectedAssets={selectedAlignmentAssets}
            audioDuration={audioDuration}
            durationStatus={narrationDurationStatus}
            currentTime={currentTime}
            activeScene={activeVisualScene}
            audioElement={narrationAudioElement}
            videoRef={visualVideoRef}
            renderedVideoUrl={renderedVideoUrl}
            renderSeconds={renderSeconds}
            validation={exportValidation}
            musicSettings={selectedProject.backgroundMusicSettings ?? DEFAULT_BACKGROUND_MUSIC_SETTINGS}
            narrationFile={audioFile}
            visualFiles={visualLibraryFiles}
            musicAudioElement={musicAudioElement}
            monitorStatus={liveMonitor.status}
            canUndo={(projectEditHistories[selectedProject.id]?.undo.length ?? 0) > 0}
            canRedo={(projectEditHistories[selectedProject.id]?.redo.length ?? 0) > 0}
            musicFile={musicFile}
            uploadMessage={uploadMessage}
            mediaMessage={visualLibraryMessage}
            musicMessage={musicMessage}
            segmentationMessage={segmentationMessage}
            autoPrepareMessage={alignmentMessage}
            renderStatus={renderMessage}
            timelineMessage={timelineMessage}
            uploadingNarration={uploading}
            uploadingVisual={visualLibraryUploading}
            uploadingMusic={musicUploading}
            segmenting={segmenting}
            preparing={preparingScenes}
            rendering={rendering}
            onBack={() => setView("projects")}
            onNarrationFile={setAudioFile}
            onVisualFiles={setVisualLibraryFiles}
            onMusicFile={setMusicFile}
            onUploadNarration={uploadNarration}
            onUploadVisual={uploadVisualLibraryAsset}
            onUploadMusic={uploadBackgroundMusic}
            onRefreshAssets={() => { if (selectedProjectId) void refreshVisualLibrary(selectedProjectId); }}
            onToggleAsset={(assetId) => setSelectedAlignmentAssets((previous) => previous.includes(assetId) ? previous.filter((id) => id !== assetId) : [...previous, assetId])}
            onAutoPrepare={() => void prepareScenesAutomaticallyNow()}
            onSuggestSegments={() => void suggestNarrationSegments()}
            onUpdateSegment={updateNarrationSegment}
            onSplitSegment={splitNarrationSegment}
            onMergeSegment={mergeNarrationSegmentWithNext}
            onAppendSlots={appendNarrationSegmentsAsScenes}
            onSeek={seekToTime}
            onSceneUpdate={updateVisualScene}
            onSceneDelete={deleteVisualScene}
            onAssignAsset={assignVisualAsset}
            onDropAsset={assignVisualAsset}
            onAddScene={addVisualScene}
            onPauseUpdate={updateTeachingPause}
            onPauseDelete={deleteTeachingPause}
            onAddPause={addTeachingPause}
            onJumpPause={jumpToTeachingPause}
            onMusicSelect={(filename) => {
              const asset = musicLibrary.find((item) => item.filename === filename);
              updateProjectMusic({ backgroundMusic: asset ? { filename: asset.filename, originalName: asset.originalName } : undefined });
              setMusicMessage(asset ? `${asset.originalName} selected for live preview and export.` : "Background music disabled; exports use narration only.");
            }}
            onMusicSetting={updateMusicSetting}
            onGenerate={() => void generateVideo()}
            onUndo={undoCurrentProject}
            onRedo={redoCurrentProject}
            formatTime={formatDuration}
          />
        )}
      </main>
    </div>
  );
}

export default App;
