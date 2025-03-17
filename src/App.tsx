import { DoomCanvas } from '@/components/DoomCanvas';

export const App = () => {
  console.log('App loaded!'); // Debug here
  return (
    <div style={{ padding: '1rem' }}>
      <h1>Doom React/Vite/WebGL</h1>
      <DoomCanvas />
    </div>
  );
};
