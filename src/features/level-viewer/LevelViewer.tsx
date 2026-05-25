import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Wad } from '@/wad/interfaces/Wad';
import { WAD_OPTIONS } from '@/config/doomAssets';
import { drawMap } from '@/wad/renderer/drawAssets/drawMap';
import { renderGame } from '@/wad/renderer/renderGame/renderGame';
import { useDoomLoader } from './useDoomLoader';
import { useLevelMusic } from './music/useLevelMusic';
import { DoomLevelTransition } from './DoomLevelTransition';

interface GameRenderer {
  load: ReturnType<typeof renderGame>['load'];
  setPresentationVisible: ReturnType<typeof renderGame>['setPresentationVisible'];
}

type PlaybackPhase = 'hidden' | 'loading-screen' | 'wiping' | 'playing';

export const LevelViewer: React.FC<{ onWadChange?: (wad: Wad | null) => void }> = ({
  onWadChange,
}) => {
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<GameRenderer | null>(null);
  const [playbackPhase, setPlaybackPhase] = useState<PlaybackPhase>('hidden');

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
  const awaitingReveal = levelDataReady && playbackPhase !== 'playing';

  useEffect(() => {
    setPlaybackPhase('hidden');
    game?.setPresentationVisible(false);
  }, [selectedMap, wadPath, game]);

  useEffect(() => {
    if (!awaitingReveal || !wad || !selectedMap || !game) return;

    setPlaybackPhase('loading-screen');
    game.setPresentationVisible(true);

    const frame = requestAnimationFrame(() => {
      setPlaybackPhase('wiping');
    });

    const fallback = window.setTimeout(() => {
      setPlaybackPhase('playing');
    }, 2500);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
    };
  }, [awaitingReveal, wad, selectedMap, game]);

  const handleWipeComplete = useCallback(() => {
    setPlaybackPhase('playing');
    if (music.enabled) {
      music.play();
    }
  }, [music]);

  useEffect(() => {
    if (!wad || !selectedMap || !mapCanvasRef.current) return;
    const map = wad.maps[selectedMap];
    if (map) {
      drawMap(mapCanvasRef.current, map);
    }
  }, [selectedMap, wad]);

  const transitionMode =
    playbackPhase === 'wiping' ? 'wipe' : ('static' as const);
  const showTransition =
    Boolean(wad && selectedMap) &&
    (mapLoadState === 'loading' || playbackPhase !== 'playing');
  const hideGameCanvas = playbackPhase !== 'playing';

  return (
    <section className="doom-panel level-viewer">
      <div className="level-controls">
        <div className="level-toolbar">
          <label className="doom-field">
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

          <label className="doom-field">
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
          <button
            type="button"
            className={`doom-button music-toggle ${music.enabled ? 'active' : 'secondary'}`}
            onClick={music.toggle}
          >
            Music {music.enabled ? 'On' : 'Off'}
          </button>
        </div>

        <div className="music-status music-status--compact">
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
        </div>
      </div>

      <DoomLoader status={status} wad={wad} mapLoading={mapLoadState === 'loading'} />

      <div className="canvas-grid">
        <figure className="canvas-card minimap-card">
          <figcaption>Automap</figcaption>
          <canvas ref={mapCanvasRef} width="400" height="400" />
        </figure>
        <figure className={`canvas-card game-card ${hideGameCanvas ? 'game-card--hidden' : ''}`}>
          <figcaption>
            Renderer
            <span>WASD move · Shift walk · Space jump · Click/E use · Esc release</span>
          </figcaption>
          <div className="game-card__viewport">
            <canvas ref={gameCanvasRef} width="960" height="600" tabIndex={0} />
            <DoomLevelTransition
              active={showTransition}
              mode={transitionMode}
              wad={wad}
              gameCanvasRef={gameCanvasRef}
              onComplete={handleWipeComplete}
            />
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
  const showDetail = !isReady || mapLoading || status.state === 'loading' || status.state === 'error';

  return (
    <div className={`doom-loader doom-loader--compact ${status.state} ${mapLoading ? 'map-loading' : ''}`}>
      <div className="loader-header">
        <div>
          <span className="loader-kicker">WAD Loader</span>
          <h2>{mapLoading ? 'P_SetupLevel' : status.title}</h2>
          {showDetail ? <p>{status.detail}</p> : null}
        </div>
        <div className="cache-badge">{status.fromCache ? 'CACHE HIT' : status.state.toUpperCase()}</div>
      </div>

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

      <div
        className={`loader-status-line ${status.state === 'error' ? 'error-line' : ''}`}
        aria-live="polite"
      >
        {mapLoading ? 'R_Init: building map geometry…' : status.statusLine}
      </div>

      {wad && isReady && !mapLoading ? (
        <div className="wad-stats wad-stats--inline">
          <span>{wad.indentification.trim()}</span>
          <span>{Object.keys(wad.maps).length} maps</span>
          <span>{wad.lumpInfo.length} lumps</span>
          {loadedAt ? <span>{loadedAt}</span> : null}
        </div>
      ) : null}
    </div>
  );
};
