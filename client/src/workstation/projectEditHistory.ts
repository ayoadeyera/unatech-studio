import type { TeachingPause, VisualScene } from "./models";

export const PROJECT_HISTORY_LIMIT = 50;
const COALESCE_WINDOW_MS = 900;

export interface ProjectEditSnapshot {
  visualScenes: VisualScene[];
  teachingPauses: TeachingPause[];
}

export interface ProjectEditHistory {
  undo: ProjectEditSnapshot[];
  redo: ProjectEditSnapshot[];
  lastActionKey?: string;
  lastActionAt?: number;
}

export type ProjectEditHistories = Record<string, ProjectEditHistory>;

function copySnapshot(snapshot: ProjectEditSnapshot): ProjectEditSnapshot {
  return {
    visualScenes: snapshot.visualScenes.map((scene) => ({ ...scene })),
    teachingPauses: snapshot.teachingPauses.map((pause) => ({ ...pause })),
  };
}

export function snapshotProjectEdits(project: Partial<ProjectEditSnapshot>): ProjectEditSnapshot {
  return copySnapshot({ visualScenes: project.visualScenes ?? [], teachingPauses: project.teachingPauses ?? [] });
}

export function recordProjectEdit(
  histories: ProjectEditHistories,
  projectId: string,
  before: ProjectEditSnapshot,
  actionKey?: string,
  now = Date.now(),
): ProjectEditHistories {
  const current = histories[projectId] ?? { undo: [], redo: [] };
  const coalesce = Boolean(actionKey && current.lastActionKey === actionKey && now - (current.lastActionAt ?? 0) <= COALESCE_WINDOW_MS);
  return {
    ...histories,
    [projectId]: {
      undo: coalesce ? current.undo : [...current.undo, copySnapshot(before)].slice(-PROJECT_HISTORY_LIMIT),
      redo: [],
      lastActionKey: actionKey,
      lastActionAt: now,
    },
  };
}

export function travelProjectEdit(
  histories: ProjectEditHistories,
  projectId: string,
  currentSnapshot: ProjectEditSnapshot,
  direction: "undo" | "redo",
): { histories: ProjectEditHistories; snapshot: ProjectEditSnapshot | null } {
  const current = histories[projectId] ?? { undo: [], redo: [] };
  const source = current[direction];
  if (!source.length) return { histories, snapshot: null };
  const destination = direction === "undo" ? "redo" : "undo";
  const snapshot = source[source.length - 1];
  return {
    histories: {
      ...histories,
      [projectId]: {
        ...current,
        [direction]: source.slice(0, -1),
        [destination]: [...current[destination], copySnapshot(currentSnapshot)].slice(-PROJECT_HISTORY_LIMIT),
        lastActionKey: undefined,
        lastActionAt: undefined,
      },
    },
    snapshot: copySnapshot(snapshot),
  };
}
