import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Wad } from '@/wad/interfaces/Wad';
import { WAD_OPTIONS } from '@/config/doomAssets';
import { renderGame } from '@/wad/renderer/renderGame/renderGame';
import { useDoomLoader } from './useDoomLoader';
import { useLevelMusic } from './music/useLevelMusic';
import { MusicVisualizer } from './music/MusicVisualizer';
import { DoomLevelTransition } from './DoomLevelTransition';
import {
  AutomapCheatLevel,
  cycleAutomapCheat,
  drawAutomap,
} from '@/wad/renderer/automap/automap';
import { appendCheatChar, cheatTriggered } from '@/wad/game/doomCheats';

interface GameRenderer {
  load: ReturnType<typeof renderGame>['load'];
  setPresentationVisible: ReturnType<typeof renderGame>['setPresentationVisible'];
  setAutomapActive: ReturnType<typeof renderGame>['setAutomapActive'];
  getPlayerState: ReturnType<typeof renderGame>['getPlayerState'];
  waitForRenderedFrame: ReturnType<typeof renderGame>['waitForRenderedFrame'];
}

type TransitionPhase = 'loading' | 'wiping' | 'playing';

const MIN_LOADING_SCREEN_MS = 450;

export const LevelViewer: React.FC<{
  onWadChange?: (wad: Wad | null) => void;
}> = ({ onWadChange }) => {
  const automapCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameRenderer | null>(null);
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('loading');
  const loadStartedAtRef = useRef(0);
  const [automapActive, setAutomapActive] = useState(false);
  const [automapCheat, setAutomapCheat] = useState<AutomapCheatLevel>(0);
  const cheatBufferRef = useRef('');

  useEffect(() => {
    if (gameCanvasRef.current && !game) {
      setGame(renderGame(gameCanvasRef.current));
    }
  }, [game]);

  const {
    wad,
    wadPath,
    mapNames,
    selectedMap,
    status,
    mapLoadState,
    setWadPath,
    setSelectedMap,
    refreshWad,
    clearCache,
  } = useDoomLoader({ game });
  const music = useLevelMusic(wad, selectedMap, wadPath);

  useEffect(() => {
    onWadChange?.(wad);
  }, [wad, onWadChange]);

  const levelDataReady = mapLoadState === 'ready';
  const isPlaying = transitionPhase === 'playing';

  useEffect(() => {
    loadStartedAtRef.current = performance.now();
    setTransitionPhase('loading');
    setAutomapActive(false);
    setAutomapCheat(0);
    cheatBufferRef.current = '';
    game?.setAutomapActive(false);
    game?.setPresentationVisible(false);
  }, [selectedMap, wadPath, game]);

  useEffect(() => {
    if (!levelDataReady || !wad || !selectedMap || !game) {
      return;
    }

    let cancelled = false;

    (async () => {
      const elapsed = performance.now() - loadStartedAtRef.current;
      const remaining = MIN_LOADING_SCREEN_MS - elapsed;
      if (remaining > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
      }

      game.setPresentationVisible(true);
      await game.waitForRenderedFrame();

      if (!cancelled) {
        setTransitionPhase('wiping');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [levelDataReady, wad, selectedMap, wadPath, game]);

  const handleSnapshotCaptured = useCallback(() => {
    game?.setPresentationVisible(false);
  }, [game]);

  const handleWipeComplete = useCallback(() => {
    game?.setPresentationVisible(true);
    setTransitionPhase('playing');
    if (music.enabled) {
      music.play();
    }
  }, [music]);

  const toggleAutomap = useCallback(() => {
    setAutomapActive((active) => {
      const next = !active;
      game?.setAutomapActive(next);
      return next;
    });
  }, [game]);

  const triggerIddt = useCallback(() => {
    setAutomapCheat((level) => cycleAutomapCheat(level));
    setAutomapActive(true);
    game?.setAutomapActive(true);
  }, [game]);

  useEffect(() => {
    if (!isPlaying) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Tab') {
        event.preventDefault();
        toggleAutomap();
        return;
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

        cheatBufferRef.current = appendCheatChar(cheatBufferRef.current, event.key);
        if (cheatTriggered(cheatBufferRef.current, 'iddt')) {
          cheatBufferRef.current = '';
          event.preventDefault();
          triggerIddt();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, toggleAutomap, triggerIddt]);

  useEffect(() => {
    if (!automapActive || !isPlaying || !wad || !selectedMap || !game) return;

    const map = wad.maps[selectedMap];
    if (!map) return;

    let frame = 0;
    const drawFrame = () => {
      const canvas = automapCanvasRef.current;
      const player = game.getPlayerState();
      if (canvas && player) {
        drawAutomap(canvas, map, { player, cheatLevel: automapCheat });
      }
      frame = requestAnimationFrame(drawFrame);
    };

    frame = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(frame);
  }, [automapActive, automapCheat, isPlaying, wad, selectedMap, game]);

  const transitionPhaseProp = transitionPhase === 'wiping' ? 'wipe' : 'loading';
  const showTransition =
    Boolean(wad && selectedMap) &&
    (mapLoadState === 'loading' || transitionPhase !== 'playing');
  const hideGameCanvas = transitionPhase !== 'playing';

  return (
    <section className="doom-panel level-viewer">
      <div className="level-toolbar">
        <div className="level-toolbar__group">
          <label className="doom-field doom-field--inline">
            <span>IWAD</span>
            <select onChange={(e) => setWadPath(e.target.value)} defaultValue="">
            <option value="" disabled>
              Select a WAD
            </option>
            {WAD_OPTIONS.map((wadOption) => (
              <option key={wadOption.id} value={wadOption.path}>
                {wadOption.label}
              </option>
            ))}
          </select>
        </label>

        <label className="doom-field doom-field--inline">
          <span>Map</span>
          <select
            value={selectedMap}
            onChange={(e) => setSelectedMap(e.target.value)}
            disabled={mapNames.length === 0}
          >
            {mapNames.length === 0 ? (
              <option value="">No maps loaded</option>
            ) : (
              mapNames.map((mapName) => (
                <option key={mapName} value={mapName}>
                  {mapName}
                </option>
              ))
            )}
          </select>
        </label>

        <button type="button" className="doom-button" onClick={refreshWad} disabled={!wad}>
          Refresh WAD
        </button>
        <button type="button" className="doom-button secondary" onClick={clearCache}>
          Clear Cache
        </button>
        </div>

        <div className="level-toolbar__group level-toolbar__group--end">
          <button
            type="button"
            className={`doom-button music-toggle ${music.enabled ? 'active' : 'secondary'}`}
            onClick={music.toggle}
          >
            Music {music.enabled ? 'On' : 'Off'}
          </button>
          <div className="music-status music-status--inline">
            <span>{music.currentLump ?? 'No WAD music'}</span>
            <strong>{music.status}</strong>
            <button
              type="button"
              className={`doom-button music-toggle ${music.enabled ? 'active' : ''}`}
              onClick={music.enabled ? music.stop : music.play}
              disabled={!wad || !selectedMap || mapLoadState !== 'ready'}
            >
              {music.enabled ? 'Stop' : 'Play'}
            </button>
            {music.playing ? <MusicVisualizer active={music.playing} /> : null}
          </div>
        </div>
      </div>

      <DoomLoader status={status} wad={wad} mapLoading={mapLoadState === 'loading'} />

      <div className="game-stage">
        <figure className={`canvas-card game-card ${hideGameCanvas ? 'game-card--hidden' : ''}`}>
          <figcaption className="game-card__caption">
            Renderer
            <span>Tab automap · iddt map modes · WASD move · Click/E use · Esc release mouse</span>
          </figcaption>
          <div className="game-card__viewport" ref={viewportRef}>
            <canvas
              ref={gameCanvasRef}
              className={`game-canvas ${automapActive ? 'game-canvas--automap' : ''}`}
              tabIndex={0}
            />
            <canvas
              ref={automapCanvasRef}
              className={`automap-canvas ${automapActive ? 'automap-canvas--active' : ''}`}
              aria-hidden={!automapActive}
            />
            <DoomLevelTransition
              active={showTransition}
              phase={transitionPhaseProp}
              wad={wad}
              mapLabel={selectedMap}
              gameCanvasRef={gameCanvasRef}
              viewportRef={viewportRef}
              onSnapshotCaptured={handleSnapshotCaptured}
              onComplete={handleWipeComplete}
            />
            {automapActive ? (
              <div className="automap-hud" aria-live="polite">
                AUTOMAP
                {automapCheat === 1 ? ' · ALL LINES' : automapCheat === 2 ? ' · ALL THINGS' : ''}
              </div>
            ) : null}
          </div>
        </figure>
      </div>
    </section>
  );
};

const DoomLoader: React.FC<{
  status: ReturnType<typeof useDoomLoader>['status'];
  wad: ReturnType<typeof useDoomLoader>['wad'];
  mapLoading: boolean;
}> = ({ status, wad, mapLoading }) => {
  const loadedAt = status.loadedAt ? new Date(status.loadedAt).toLocaleTimeString() : null;
  const isReady = status.state === 'ready' || status.state === 'cache-hit';
  const showProgress = !isReady || mapLoading || status.state === 'loading' || status.state === 'error';
  const showDetail = showProgress && status.detail;

  return (
    <div
      className={`doom-loader doom-loader--compact ${status.state} ${mapLoading ? 'map-loading' : ''} ${isReady && !mapLoading ? 'is-settled' : ''}`}
    >
      <div className="loader-header">
        <div className="loader-title-group">
          <span className="loader-kicker">WAD Loader</span>
          <h2>{mapLoading ? 'P_SetupLevel' : status.title}</h2>
          {showDetail ? <p>{status.detail}</p> : null}
          {wad && isReady && !mapLoading ? (
            <div className="wad-stats wad-stats--inline">
              <span>{wad.indentification.trim()}</span>
              <span>{Object.keys(wad.maps).length} maps</span>
              <span>{wad.lumpInfo.length} lumps</span>
              {loadedAt ? <span>{loadedAt}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="cache-badge">{status.fromCache ? 'CACHE HIT' : status.state.toUpperCase()}</div>
      </div>

      {showProgress ? (
        <div className="loader-segmented-bar" aria-label="Startup progress">
          {status.steps.map((step) => {
            const fill = step.complete ? 100 : Math.round(step.progress * 100);
            return (
              <div
                key={step.label}
                className={`loader-segment ${step.complete ? 'complete' : ''} ${step.active ? 'active' : ''}`}
                title={`${step.label}: ${step.message}`}
              >
                <span className="loader-segment__label">{step.label}</span>
                <span className="loader-segment__track">
                  <span className="loader-segment__fill" style={{ width: `${fill}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        className={`loader-status-line ${status.state === 'error' ? 'error-line' : ''}`}
        aria-live="polite"
      >
        {mapLoading ? 'R_Init: building map geometry…' : status.statusLine}
      </div>
    </div>
  );
};
