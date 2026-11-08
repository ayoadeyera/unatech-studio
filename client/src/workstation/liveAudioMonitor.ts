import type { BackgroundMusicSettings } from "../backgroundMusic";

export function liveMusicGain(settings: BackgroundMusicSettings, teachingPause: boolean): number {
  const level = teachingPause ? settings.teachingPauseMusicLevel : settings.narrationDuckingLevel;
  return Math.max(0, Math.min(1, settings.musicVolume * level));
}
