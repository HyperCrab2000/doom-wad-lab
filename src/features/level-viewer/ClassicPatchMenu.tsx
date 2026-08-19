import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Wad } from '@/wad/interfaces/Wad';
import {
  drawDoomPatchMenu,
  menuItemCount,
  menuItemId,
  type DoomPatchMenuScreen,
} from './doomPatchMenuRender';

export type { DoomPatchMenuScreen };

export interface ClassicPatchMenuProps {
  active: boolean;
  screen: DoomPatchMenuScreen;
  wad: Wad | null;
  mapName: string;
  sfxMuted: boolean;
  musicEnabled: boolean;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  gameCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onResume: () => void;
  onRestartLevel: () => void;
  onOpenMain: () => void;
  onOpenOptions: () => void;
  onBack: () => void;
  onToggleSfx: () => void;
  onToggleMusic: () => void;
  onClose: () => void;
}

const SKULL_TICK_MS = 250;

export const ClassicPatchMenu: React.FC<ClassicPatchMenuProps> = ({
  active,
  screen,
  wad,
  mapName,
  sfxMuted,
  musicEnabled,
  viewportRef,
  gameCanvasRef,
  onResume,
  onRestartLevel,
  onOpenMain,
  onOpenOptions,
  onBack,
  onToggleSfx,
  onToggleMusic,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [skullFrame, setSkullFrame] = useState<0 | 1>(0);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport || !wad || !active) return;

    const w = Math.max(1, viewport.clientWidth);
    const h = Math.max(1, viewport.clientHeight);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    drawDoomPatchMenu(canvas, {
      screen,
      selectedIndex,
      skullFrame,
      wad,
      gameCanvas: gameCanvasRef.current,
      sfxMuted,
      musicEnabled,
    });
  }, [
    active,
    gameCanvasRef,
    musicEnabled,
    screen,
    selectedIndex,
    sfxMuted,
    skullFrame,
    viewportRef,
    wad,
  ]);

  useEffect(() => {
    if (!active) return;
    setSelectedIndex(0);
  }, [active, screen]);

  useEffect(() => {
    if (!active) return;
    paint();
  }, [active, paint]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setSkullFrame((frame) => (frame === 0 ? 1 : 0));
    }, SKULL_TICK_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => paint());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [active, paint, viewportRef]);

  const activateItem = useCallback(
    (index: number) => {
      const id = menuItemId(screen, index);
      if (!id) return;

      if (screen === 'pause') {
        switch (id) {
          case 'resume':
            onResume();
            return;
          case 'options':
            onOpenOptions();
            return;
          case 'restart':
            onRestartLevel();
            return;
          case 'main':
            onOpenMain();
            return;
        }
      }

      if (screen === 'main') {
        switch (id) {
          case 'newgame':
            onRestartLevel();
            return;
          case 'options':
            onOpenOptions();
            return;
          case 'load':
          case 'save':
            return;
          case 'quit':
            onClose();
            return;
        }
      }

      if (screen === 'options') {
        switch (id) {
          case 'sfx':
            onToggleSfx();
            return;
          case 'music':
            onToggleMusic();
            return;
          case 'back':
            onBack();
            return;
        }
      }
    },
    [
      onBack,
      onClose,
      onOpenMain,
      onOpenOptions,
      onRestartLevel,
      onResume,
      onToggleMusic,
      onToggleSfx,
      screen,
    ]
  );

  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const count = menuItemCount(screen);

      if (screen === 'pause' && count === 0) {
        if (event.code === 'Escape') {
          event.preventDefault();
          onOpenMain();
          return;
        }
        if (
          event.code === 'Enter' ||
          event.code === 'Space' ||
          event.code === 'KeyM' ||
          event.code === 'Pause'
        ) {
          event.preventDefault();
          onResume();
        }
        return;
      }

      if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        event.preventDefault();
        setSelectedIndex((index) => (index - 1 + count) % count);
        return;
      }

      if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        event.preventDefault();
        setSelectedIndex((index) => (index + 1) % count);
        return;
      }

      if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        activateItem(selectedIndex);
        return;
      }

      if (event.code === 'Escape') {
        event.preventDefault();
        if (screen === 'options') {
          onBack();
        } else if (screen === 'main') {
          onResume();
        } else if (screen === 'pause') {
          onResume();
        } else {
          onClose();
        }
      }

      const shortcut = event.key.toLowerCase();
      if (screen === 'main') {
        const shortcuts: Record<string, number> = { n: 0, o: 1, l: 2, s: 3, q: 4 };
        const index = shortcuts[shortcut];
        if (index !== undefined && index < count) {
          event.preventDefault();
          activateItem(index);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activateItem, active, onBack, onClose, onOpenMain, onResume, screen, selectedIndex]);

  if (!active || !wad) return null;

  return (
    <div
      className="doom-patch-menu doom-patch-menu--active"
      role="dialog"
      aria-modal="true"
      aria-label={`Doom menu · ${screen} · ${mapName}`}
    >
      <canvas ref={canvasRef} className="doom-patch-menu__canvas" />
    </div>
  );
};
