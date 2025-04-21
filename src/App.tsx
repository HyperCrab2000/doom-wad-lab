import { DoomCanvas } from '@/components/DoomCanvas';

export const App = () => {
  console.log('App loaded!'); // Debug here
  return (
    <div style={{ padding: '1rem' }}>
      <h1>Doom React/Vite/WebGL</h1>
      <DoomCanvas />
      <div id="fps-counter" style={{
        position: 'absolute',
        top: '8px',
        left: '8px',
        background: 'rgba(0, 0, 0, 0.6)',
        color: '#0f0',
        padding: '4px 8px',
        fontFamily: 'monospace',
        fontSize: '14px',
        zIndex: 1000,
        pointerEvents: 'none'
      }}>
        FPS: ...
      </div>
    </div>
  );
};
