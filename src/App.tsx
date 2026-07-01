import { lazy, Suspense, useState } from 'react';
import { LevelViewer } from '@/features/level-viewer/LevelViewer';
import { DoomHeaderLogo } from '@/features/level-viewer/DoomHeaderLogo';

const VoxelModelViewer = lazy(() =>
  import('@/features/voxel-viewer/VoxelModelViewer').then((module) => ({
    default: module.VoxelModelViewer,
  }))
);

type AppMode = 'levels' | 'voxels';

export const App = () => {
  const [mode, setMode] = useState<AppMode>('levels');

  return (
    <div className="app-shell">
      <header className="hero">
        <DoomHeaderLogo />

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
        {mode === 'levels' ? (
          <LevelViewer />
        ) : (
          <Suspense fallback={<p className="viewer-loading">Loading voxel viewer…</p>}>
            <VoxelModelViewer />
          </Suspense>
        )}
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
