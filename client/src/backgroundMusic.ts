export interface BackgroundMusicSettings {
  musicVolume: number;
  narrationDuckingLevel: number;
  teachingPauseMusicLevel: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  transitionDuration: number;
}

export const DEFAULT_BACKGROUND_MUSIC_SETTINGS: Readonly<BackgroundMusicSettings> = {
  musicVolume: 0.2,
  narrationDuckingLevel: 0.3,
  teachingPauseMusicLevel: 0.55,
  fadeInDuration: 0.8,
  fadeOutDuration: 1,
  transitionDuration: 0.6,
};
