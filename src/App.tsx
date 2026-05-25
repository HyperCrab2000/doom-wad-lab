import { useState } from 'react';
import { LevelViewer } from '@/features/level-viewer/LevelViewer';
import { DoomHeaderLogo } from '@/features/level-viewer/DoomHeaderLogo';
import { VoxelModelViewer } from '@/features/voxel-viewer/VoxelModelViewer';

type AppMode = 'levels' | 'voxels';

export const App = () => {
  const [mode, setMode] = useState<AppMode>('levels');

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-brand">
          <DoomHeaderLogo />
          <p className="hero-tagline">
            Browser WebGL2 renderer for IWAD maps — built with Node, drawn in the GPU.
          </p>
        </div>

        <nav className="mode-tabs" aria-label="Viewer mode">
          <button
            type="button"
            className={mode === 'levels' ? 'active' : ''}
            onClick={() => setMode('levels')}
          >
            Level Viewer
          </button>
          <button
            type="button"
            className={mode === 'voxels' ? 'active' : ''}
            onClick={() => setMode('voxels')}
          >
            Voxel Viewer
          </button>
        </nav>
      </header>

      <main className="app-main">
        {mode === 'levels' ? <LevelViewer /> : <VoxelModelViewer />}
      </main>

      <div id="fps-counter" className="fps-counter">
        FPS: ...
      </div>
      <div id="voxel-counter" className="voxel-counter">
        VOXELS: ...
      </div>
    </div>
  );
};
