import { useCallback, useEffect, useRef, useState } from 'react';
import { Wad } from '@/wad/interfaces/Wad';
import { getMusicLump, getMusicLumpForMap } from './doomMusic';
import {
  clearMusicPreloadCache,
  isMusicPrepared,
  musicCacheKey,
  preloadMusicLump,
} from './musicPreload';
import { getSoundfontEngine } from './soundfontEngine';
import { WebAudioMusPlayer } from './webAudioMusPlayer';

export interface LevelMusicState {
  enabled: boolean;
  playing: boolean;
  isPrepared: boolean;
  status: string;
  currentLump: string | null;
  play: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useLevelMusic(
  wad: Wad | null,
  mapName: string,
  wadPath: string | null
): LevelMusicState {
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [isPrepared, setIsPrepared] = useState(false);
  const [status, setStatus] = useState('Music off');
  const [currentLump, setCurrentLump] = useState<string | null>(null);
  const playerRef = useRef<WebAudioMusPlayer | null>(null);
  const enabledRef = useRef(false);
  const wadRef = useRef(wad);
  const mapRef = useRef(mapName);
  const wadPathRef = useRef(wadPath);
  const lastTrackRef = useRef<{ wad: Wad | null; mapName: string; wadPath: string | null }>({
    wad: null,
    mapName: '',
    wadPath: null,
  });

  wadRef.current = wad;
  mapRef.current = mapName;
  wadPathRef.current = wadPath;
  enabledRef.current = enabled;

  useEffect(() => {
    const player = new WebAudioMusPlayer();
    playerRef.current = player;
    return () => {
      player.stop();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    void getSoundfontEngine()
      .then(() => {
        if (!enabledRef.current) {
          setStatus((prev) => (prev.startsWith('Loading SoundFont') ? 'Music off' : prev));
        }
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'SoundFont load failed');
      });
  }, []);

  const updateReadyStatus = useCallback((currentWad: Wad | null, currentMap: string) => {
    if (!currentWad || !currentMap) {
      setCurrentLump(null);
      setStatus('Select a WAD/map first');
      return;
    }

    const lump = getMusicLump(currentWad, currentMap);
    const expected = getMusicLumpForMap(currentMap);
    setCurrentLump(lump?.name ?? expected);
    setStatus(
      lump ? `Ready: ${lump.name} (music off)` : `Expected ${expected}, but it is not in this WAD`
    );
  }, []);

  const playCurrentTrack = useCallback(async () => {
    const player = playerRef.current;
    const currentWad = wadRef.current;
    const currentMap = mapRef.current;
    const path = wadPathRef.current;

    if (!player || !currentWad || !currentMap) {
      setStatus('Select a WAD/map first');
      return;
    }

    const lump = getMusicLump(currentWad, currentMap);
    const expected = getMusicLumpForMap(currentMap);
    setCurrentLump(lump?.name ?? expected);

    if (!lump) {
      setStatus(`Expected ${expected}, but it is not in this WAD`);
      return;
    }

    const cacheKey = musicCacheKey(path, lump.name);

    try {
      if (!isMusicPrepared(cacheKey)) {
        setStatus(`Preparing ${lump.name}…`);
        await preloadMusicLump(lump.data, cacheKey);
      }

      setStatus(`Playing ${lump.name}`);
      player.unlockAudio();
      await player.play(lump.data, cacheKey);
      setPlaying(true);
    } catch (error) {
      setPlaying(false);
      setStatus(error instanceof Error ? error.message : `Could not play ${lump.name}`);
    }
  }, []);

  useEffect(() => {
    const trackChanged =
      lastTrackRef.current.wad !== wad ||
      lastTrackRef.current.mapName !== mapName ||
      lastTrackRef.current.wadPath !== wadPath;

    if (trackChanged) {
      playerRef.current?.stop();
      setPlaying(false);
      lastTrackRef.current = { wad, mapName, wadPath };
    }

    setIsPrepared(!enabledRef.current);

    if (!wad || !mapName) {
      setCurrentLump(null);
      setStatus('Music off');
      return;
    }

    const lump = getMusicLump(wad, mapName);
    const expected = getMusicLumpForMap(mapName);
    setCurrentLump(lump?.name ?? expected);

    if (!lump) {
      setStatus(`Expected ${expected}, but it is not in this WAD`);
      setIsPrepared(true);
      return;
    }

    const cacheKey = musicCacheKey(wadPath, lump.name);
    void preloadMusicLump(lump.data, cacheKey)
      .then(() => {
        if (wadRef.current !== wad || mapRef.current !== mapName) return;
        setIsPrepared(true);
        if (!enabledRef.current) {
          setStatus(`Ready: ${lump.name} (music off)`);
        }
      })
      .catch((error) => {
        setIsPrepared(false);
        setStatus(error instanceof Error ? error.message : `Could not prepare ${lump.name}`);
      });
  }, [wad, mapName, wadPath]);

  const play = useCallback(() => {
    playerRef.current?.unlockAudio();
    setEnabled(true);
    void playCurrentTrack();
  }, [playCurrentTrack]);

  const stop = useCallback(() => {
    setEnabled(false);
    setPlaying(false);
    playerRef.current?.stop();
    updateReadyStatus(wadRef.current, mapRef.current);
  }, [updateReadyStatus]);

  const toggle = useCallback(() => {
    if (enabledRef.current) {
      setEnabled(false);
      setPlaying(false);
      playerRef.current?.stop();
      updateReadyStatus(wadRef.current, mapRef.current);
      return;
    }

    playerRef.current?.unlockAudio();
    setEnabled(true);
    void playCurrentTrack();
  }, [playCurrentTrack, updateReadyStatus]);

  return {
    enabled,
    playing,
    isPrepared,
    status,
    currentLump,
    play,
    stop,
    toggle,
  };
}
