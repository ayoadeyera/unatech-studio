import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { BackgroundMusicSettings } from "../backgroundMusic";
import { liveMusicGain } from "./liveAudioMonitor";

interface Options {
  narrationRef: RefObject<HTMLAudioElement | null>;
  musicRef: RefObject<HTMLAudioElement | null>;
  musicUrl: string | null;
  settings: BackgroundMusicSettings;
  teachingPause: boolean;
}

interface AudioNodes { gain: GainNode; }

export function useLiveAudioMonitor({ narrationRef, musicRef, musicUrl, settings, teachingPause }: Options) {
  const contextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef(new WeakMap<HTMLMediaElement, AudioNodes>());
  const pauseTimeoutRef = useRef<number | null>(null);
  const [status, setStatus] = useState("Live music monitoring is ready when you press play.");

  const ensureNodes = useCallback((element: HTMLMediaElement, context: AudioContext): AudioNodes => {
    const existing = nodesRef.current.get(element);
    if (existing) return existing;
    const source = context.createMediaElementSource(element);
    const gain = context.createGain();
    source.connect(gain);
    gain.connect(context.destination);
    const nodes = { gain };
    nodesRef.current.set(element, nodes);
    return nodes;
  }, []);

  const setGain = useCallback((gain: GainNode, value: number, duration: number) => {
    const now = contextRef.current?.currentTime ?? 0;
    const param = gain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    if (duration > 0) param.setTargetAtTime(value, now, Math.max(0.025, duration / 4));
    else param.setValueAtTime(value, now);
  }, []);

  const initialize = useCallback(async () => {
    const narration = narrationRef.current;
    const music = musicRef.current;
    if (!narration) return;
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) throw new Error("Web Audio API is unavailable.");
      const context = contextRef.current ?? new AudioContextConstructor();
      contextRef.current = context;
      const narrationNodes = ensureNodes(narration, context);
      setGain(narrationNodes.gain, 1, settings.transitionDuration);
      if (musicUrl && music) {
        const musicNodes = ensureNodes(music, context);
        setGain(musicNodes.gain, music.currentTime < 0.05 ? 0 : liveMusicGain(settings, teachingPause), settings.transitionDuration);
      }
      await context.resume();
      setStatus(musicUrl ? "Live music mix active; export uses the FFmpeg mix." : "Live narration monitor active.");
    } catch {
      if (musicUrl && music) music.volume = liveMusicGain(settings, teachingPause);
      setStatus(musicUrl ? "Basic browser music monitoring active; FFmpeg export provides final fade and mix processing." : "Narration playback active.");
    }
  }, [ensureNodes, musicRef, musicUrl, narrationRef, setGain, settings, teachingPause]);

  const syncTo = useCallback((time: number) => {
    const music = musicRef.current;
    if (!music || !musicUrl || !Number.isFinite(time) || teachingPause) return;
    if (Math.abs(music.currentTime - time) > 0.18) {
      try { music.currentTime = Math.max(0, time); } catch { /* Metadata may still be loading. */ }
    }
  }, [musicRef, musicUrl, teachingPause]);

  const onNarrationPlay = useCallback(() => {
    if (pauseTimeoutRef.current !== null) {
      window.clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
    void initialize().then(() => {
      const music = musicRef.current;
      const narration = narrationRef.current;
      if (!musicUrl || !music || !narration) return;
      syncTo(narration.currentTime);
      if (music.paused) {
        const gain = nodesRef.current.get(music)?.gain;
        const context = contextRef.current;
        if (gain && context && music.currentTime < 0.05 && settings.fadeInDuration > 0) {
          const now = context.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(liveMusicGain(settings, teachingPause), now + settings.fadeInDuration);
        }
        void music.play().catch(() => setStatus("Press play again to enable live music monitoring."));
      }
    });
  }, [initialize, musicRef, musicUrl, narrationRef, settings, syncTo, teachingPause]);

  const onNarrationPause = useCallback((pauseLock = teachingPause) => {
    const music = musicRef.current;
    if (!pauseLock && music && !music.paused) music.pause();
  }, [musicRef, teachingPause]);

  const onNarrationEnded = useCallback(() => {
    const music = musicRef.current;
    const gain = music ? nodesRef.current.get(music)?.gain : undefined;
    const fade = Math.max(0, settings.fadeOutDuration);
    if (gain && contextRef.current && fade > 0) {
      const now = contextRef.current.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fade);
    }
    if (pauseTimeoutRef.current !== null) window.clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = window.setTimeout(() => {
      if (music) { music.pause(); music.currentTime = 0; }
      pauseTimeoutRef.current = null;
    }, fade * 1000);
  }, [musicRef, settings.fadeOutDuration]);

  useEffect(() => {
    const narration = narrationRef.current;
    const music = musicRef.current;
    if (!musicUrl) {
      music?.pause();
      if (music) music.removeAttribute("src");
      return;
    }
    if (music && music.src !== new URL(musicUrl, window.location.href).href) {
      music.pause();
      music.src = musicUrl;
      music.load();
    }
    if (!narration || !music) return;
    try {
      const context = contextRef.current;
      if (context) {
        const narrationGain = ensureNodes(narration, context).gain;
        const musicGainNode = ensureNodes(music, context).gain;
        setGain(narrationGain, 1, settings.transitionDuration);
        const target = liveMusicGain(settings, teachingPause);
        const isFirstPlay = !narration.paused && music.currentTime < 0.05 && !music.paused;
        if (isFirstPlay && settings.fadeInDuration > 0) {
          const now = context.currentTime;
          musicGainNode.gain.cancelScheduledValues(now);
          musicGainNode.gain.setValueAtTime(0, now);
          musicGainNode.gain.linearRampToValueAtTime(target, now + settings.fadeInDuration);
        } else setGain(musicGainNode, target, settings.transitionDuration);
      } else music.volume = liveMusicGain(settings, teachingPause);
    } catch {
      music.volume = liveMusicGain(settings, teachingPause);
    }
  }, [ensureNodes, musicRef, musicUrl, narrationRef, setGain, settings, teachingPause]);

  useEffect(() => () => {
    if (pauseTimeoutRef.current !== null) window.clearTimeout(pauseTimeoutRef.current);
    musicRef.current?.pause();
  }, [musicRef]);

  return { status, syncTo, onNarrationPlay, onNarrationPause, onNarrationEnded };
}
