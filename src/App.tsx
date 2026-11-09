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
    <div className="app-shell app-shell--single-page">
      <header className="hero hero--compact">
        <DoomHeaderLogo />

        <nav className="mode-tabs" aria-label="Viewer mode">
          <button
            type="button"
            className={mode === 'levels' ? 'active' : ''}
            onClick={() => setMode('levels')}
          >
            Levels
          </button>
          <button
            type="button"
            className={mode === 'voxels' ? 'active' : ''}
            onClick={() => setMode('voxels')}
          >
            Voxels
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

      <div id="fps-counter" className="fps-counter" aria-hidden="true">
        FPS: ...
      </div>
      <div id="voxel-counter" className="voxel-counter" aria-hidden="true">
        VOXELS: ...
      </div>
    </div>
  );
};
