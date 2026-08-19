import { createCanvas, ImageData as NodeImageData } from 'canvas';

/** Minimal browser DOM stubs for headless HUD/status-bar rasterization. */
export function installNodeCanvasDocument(): void {
  if (typeof globalThis.ImageData === 'undefined') {
    (globalThis as unknown as { ImageData: typeof NodeImageData }).ImageData = NodeImageData;
  }
  if (typeof globalThis.document !== 'undefined') return;
  (globalThis as unknown as { document: Document }).document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`headless document stub: unsupported element ${tagName}`);
      }
      return createCanvas(1, 1) as unknown as HTMLCanvasElement;
    },
  } as Document;
}
