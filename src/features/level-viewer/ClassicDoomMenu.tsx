import React from 'react';

export type ClassicMenuScreen = 'pause' | 'main' | 'options';

export interface ClassicDoomMenuProps {
  screen: ClassicMenuScreen;
  mapName: string;
  sfxMuted: boolean;
  musicEnabled: boolean;
  onResume: () => void;
  onRestartLevel: () => void;
  onOpenMain: () => void;
  onOpenOptions: () => void;
  onBack: () => void;
  onToggleSfx: () => void;
  onToggleMusic: () => void;
}

export const ClassicDoomMenu: React.FC<ClassicDoomMenuProps> = ({
  screen,
  mapName,
  sfxMuted,
  musicEnabled,
  onResume,
  onRestartLevel,
  onOpenMain,
  onOpenOptions,
  onBack,
  onToggleSfx,
  onToggleMusic,
}) => {
  const title =
    screen === 'options' ? 'OPTIONS' : screen === 'main' ? 'DOOM' : 'PAUSED';

  return (
    <div className="doom-menu-overlay" role="dialog" aria-modal="true" aria-label="Doom menu">
      <div className="doom-menu-panel">
        <div className="doom-menu-title">{title}</div>
        {screen === 'pause' ? (
          <>
            <button type="button" onClick={onResume}>
              Resume Game
            </button>
            <button type="button" onClick={onOpenOptions}>
              Options
            </button>
            <button type="button" onClick={onRestartLevel}>
              Restart Level
            </button>
            <button type="button" onClick={onOpenMain}>
              Main Menu
            </button>
          </>
        ) : null}
        {screen === 'main' ? (
          <>
            <button type="button" onClick={onResume}>
              New Game
            </button>
            <button type="button" onClick={onOpenOptions}>
              Options
            </button>
            <button type="button" disabled title="Not implemented">
              Load Game
            </button>
            <button type="button" disabled title="Not implemented">
              Save Game
            </button>
            <button type="button" onClick={onRestartLevel}>
              Restart {mapName}
            </button>
          </>
        ) : null}
        {screen === 'options' ? (
          <>
            <button type="button" onClick={onToggleSfx}>
              Sound FX: {sfxMuted ? 'Off' : 'On'}
            </button>
            <button type="button" onClick={onToggleMusic}>
              Music: {musicEnabled ? 'On' : 'Off'}
            </button>
            <button type="button" onClick={onBack}>
              Back
            </button>
          </>
        ) : null}
        <div className="doom-menu-hint">
          Esc: close · Tab automap · E/use · Space jump · Ctrl fire · {mapName}
        </div>
      </div>
    </div>
  );
};
