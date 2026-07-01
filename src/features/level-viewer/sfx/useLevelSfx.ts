import { useCallback, useEffect, useRef, useState } from 'react';
import { Wad } from '@/wad/interfaces/Wad';
import { getLazyIwad, type LazyIwad } from '@/wad/loader/iwadLumpAccess';
import { getHostedGzdoomModule } from '@/wad/renderer/gzrender-v2/gzdoom/gzdoomViewerRuntime';
import { getGzdoomSModule } from '@/wad/renderer/gzrender-v2/gzdoom/gzdoomSViewerRuntime';
import { WebAudioSfxPlayer } from './webAudioSfxPlayer';

const MUTE_KEY = 'doom-sfx-muted';

interface SfxEvent {
  lump: string;
  vol: number;
}

export interface LevelSfxState {
  muted: boolean;
  toggleMuted: () => void;
  unlock: () => void;
}

/**
 * Drains GZDoom's decoupled SFX event queue (gzr_poll_sound_events) each animation frame and plays
 * the named DS* lumps through Web Audio. For GZDoom WASM play (raw IWAD), lumps are sliced lazily
 * from the IWAD on demand — only the exact DS* lump a sound event needs is read, never a full WAD
 * parse. For Classic / GZDoom (s), uses the already-parsed `wad` lumpHash.
 */
export function useLevelSfx(
  active: boolean,
  wad: Wad | null,
  iwadPath?: string | null,
): LevelSfxState {
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(MUTE_KEY) === '1';
  });
  const playerRef = useRef<WebAudioSfxPlayer | null>(null);
  const wadRef = useRef<Wad | null>(wad);
  const iwadPathRef = useRef(iwadPath);
  const lazyIwadRef = useRef<LazyIwad | null>(null);
  wadRef.current = wad;
  iwadPathRef.current = iwadPath;

  if (!playerRef.current) playerRef.current = new WebAudioSfxPlayer();

  // GZDoom WASM play: fetch the IWAD once and index its DIRECTORY only (offsets/sizes). Lump bodies
  // are NOT sliced here — the resolver slices a single DS* lump on demand when a sound plays. This
  // avoids any JS-side WAD parse for normal GZDoom play.
  useEffect(() => {
    if (!active || wad || !iwadPath) {
      lazyIwadRef.current = null;
      return;
    }
    let cancelled = false;
    void getLazyIwad(iwadPath)
      .then((lazy) => {
        if (!cancelled) lazyIwadRef.current = lazy;
      })
      .catch(() => {
        lazyIwadRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [active, wad, iwadPath]);

  useEffect(() => {
    playerRef.current?.setMuted(muted);
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  }, [muted]);

  const unlock = useCallback(() => {
    playerRef.current?.unlock();
  }, []);

  // Resume the audio context on the first user gesture anywhere (WebAudio autoplay policy).
  useEffect(() => {
    if (!active) return;
    const onGesture = () => playerRef.current?.unlock();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [active]);

  // Poll the engine's sound-event queue while a GZDoom WASM play session is active.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const resolve = (name: string): ArrayBuffer | undefined => {
      const hash = wadRef.current?.lumpHash;
      if (hash) {
        return hash[name] ?? hash[name.toUpperCase()] ?? hash[name.toLowerCase()];
      }
      // GZDoom WASM play: slice this one lump from the IWAD on demand (directory lookup + slice).
      return lazyIwadRef.current?.read(name);
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const mod = getHostedGzdoomModule() ?? getGzdoomSModule();
      const poll = mod?._gzr_poll_sound_events;
      const toStr = mod?.UTF8ToString;
      if (!poll || !toStr) return;
      let json: string;
      try {
        // MEMORY64 (wasm64) returns pointers as BigInt; UTF8ToString asserts on bigint and would
        // abort the whole WASM runtime (freezing the game). Coerce to Number and skip null.
        const ptr = poll();
        const ptrNum = typeof ptr === 'bigint' ? Number(ptr) : ptr;
        if (!ptrNum) return;
        json = toStr(ptrNum);
      } catch {
        return;
      }
      if (!json || json === '[]') return;
      let events: SfxEvent[];
      try {
        events = JSON.parse(json) as SfxEvent[];
      } catch {
        return;
      }
      const player = playerRef.current;
      if (!player) return;
      for (const e of events) {
        if (e && typeof e.lump === 'string') player.play(e.lump, e.vol ?? 1, resolve);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  useEffect(() => {
    return () => {
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  const toggleMuted = useCallback(() => setMuted((m) => !m), []);

  return { muted, toggleMuted, unlock };
}
