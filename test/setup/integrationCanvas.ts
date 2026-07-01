import { createCanvas, ImageData as NodeImageData } from 'canvas';

const mockGl = {
  TEXTURE_2D: 0x0de1,
  RGBA: 0x1908,
  UNSIGNED_BYTE: 0x1401,
  UNSIGNED_SHORT: 0x1403,
  FLOAT: 0x1406,
  BYTE: 0x1400,
  SHORT: 0x1402,
  NEAREST: 0x2600,
  LINEAR: 0x2601,
  LINEAR_MIPMAP_LINEAR: 0x2703,
  CLAMP_TO_EDGE: 0x812f,
  REPEAT: 0x2901,
  ARRAY_BUFFER: 0x8892,
  ELEMENT_ARRAY_BUFFER: 0x8893,
  STATIC_DRAW: 0x88e4,
  TRIANGLES: 0x0004,
  UNPACK_FLIP_Y_WEBGL: 0x9240,
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
  createTexture: () => ({}),
  createBuffer: () => ({}),
  createVertexArray: () => ({}),
  bindTexture: () => {},
  bindBuffer: () => {},
  texImage2D: () => {},
  texParameteri: () => {},
  texParameterf: () => {},
  pixelStorei: () => {},
  generateMipmap: () => {},
  bufferData: () => {},
  useProgram: () => {},
  drawElements: () => {},
  deleteTexture: () => {},
  deleteBuffer: () => {},
  deleteVertexArray: () => {},
  getAttribLocation: () => 0,
  enableVertexAttribArray: () => {},
  vertexAttribPointer: () => {},
  createProgram: () => ({}),
  createShader: () => ({}),
  shaderSource: () => {},
  compileShader: () => {},
  attachShader: () => {},
  linkProgram: () => {},
  getExtension: () => null,
};

(globalThis as typeof globalThis & { document: Document }).document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') {
      const canvas = createCanvas(1, 1);
      const nativeGetContext = canvas.getContext.bind(canvas);
      canvas.getContext = ((type: string) => {
        if (type === 'webgl2' || type === 'webgl') {
          return mockGl as unknown as WebGL2RenderingContext;
        }
        return nativeGetContext(type);
      }) as typeof canvas.getContext;
      return canvas as unknown as HTMLCanvasElement;
    }
    return {} as HTMLElement;
  },
} as Document;

(globalThis as typeof globalThis & { WebGL2RenderingContext: typeof WebGL2RenderingContext }).WebGL2RenderingContext =
  class {} as typeof WebGL2RenderingContext;

(globalThis as typeof globalThis & { HTMLCanvasElement: typeof HTMLCanvasElement }).HTMLCanvasElement =
  class {} as typeof HTMLCanvasElement;

(globalThis as typeof globalThis & { createImageBitmap?: typeof createImageBitmap }).createImageBitmap = async () =>
  ({ close: () => {} }) as ImageBitmap;

(globalThis as typeof globalThis & { ImageData: typeof ImageData }).ImageData =
  NodeImageData as unknown as typeof ImageData;
