export interface BackgroundMusicSettings {
  musicVolume: number;
  narrationDuckingLevel: number;
  teachingPauseMusicLevel: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  transitionDuration: number;
}

export const DEFAULT_BACKGROUND_MUSIC_SETTINGS: Readonly<BackgroundMusicSettings> = {
  musicVolume: 0.24,
  narrationDuckingLevel: 0.35,
  teachingPauseMusicLevel: 0.75,
  fadeInDuration: 1.25,
  fadeOutDuration: 1.75,
  transitionDuration: 0.8,
};
