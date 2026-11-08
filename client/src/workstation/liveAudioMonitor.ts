import type { BackgroundMusicSettings } from "../backgroundMusic";

export function liveMusicGain(settings: BackgroundMusicSettings, teachingPause: boolean): number {
  const level = teachingPause ? settings.teachingPauseMusicLevel : settings.narrationDuckingLevel;
  return Math.max(0, Math.min(1, settings.musicVolume * level));
}

export interface GainAutomationParam {
  value: number;
  cancelScheduledValues(time: number): void;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
}

/** Ramp from the current gain to the requested level, independent of track position. */
export function rampMusicGain(
  param: GainAutomationParam,
  now: number,
  target: number,
  duration: number,
): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  if (duration > 0) param.linearRampToValueAtTime(target, now + duration);
  else param.setValueAtTime(target, now);
}

export function musicSyncTime(narrationTime: number, teachingPause: boolean): number | null {
  if (teachingPause || !Number.isFinite(narrationTime)) return null;
  return Math.max(0, narrationTime);
}

export function shouldPauseMusicForNarrationPause(teachingPauseLock: boolean): boolean {
  return !teachingPauseLock;
}

/** Invoke play before resuming Web Audio so both requests remain in the user gesture. */
export function playMusicBeforeResumingContext(
  music: Pick<HTMLMediaElement, "paused" | "play">,
  resumeContext: () => Promise<void>,
): Promise<void> {
  let playPromise: Promise<void>;
  try {
    playPromise = music.paused ? music.play() : Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }

  let resumePromise: Promise<void>;
  try {
    resumePromise = resumeContext();
  } catch (error) {
    return Promise.reject(error);
  }

  return Promise.all([playPromise, resumePromise]).then(() => undefined);
}
