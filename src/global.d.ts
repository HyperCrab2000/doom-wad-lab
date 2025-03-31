declare module '*.html' {
  const content: string;
  export default content;
}

declare module '*.vert' {
  const content: string;
  export default content;
}

declare module '*.frag' {
  const content: string;
  export default content;
}

// global.d.ts
interface Window {
  renderVoxelMesh: () => Promise<{ success: boolean; error?: string }>;
}
