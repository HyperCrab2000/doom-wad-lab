(globalThis as any).WebGLRenderingContext = class {};
(globalThis as any).WebGL2RenderingContext = class {};
(globalThis as any).HTMLCanvasElement = class {};

// Minimal mock for document & canvas
(globalThis as any).document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') {
      return {
        getContext: () => ({
          createTexture: () => ({}),
          createBuffer: () => ({}),
          createVertexArray: () => ({}),
          bindTexture: () => {},
          bindBuffer: () => {},
          texImage2D: () => {},
          texParameteri: () => {},
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
        }),
      };
    }
    return {};
  },
};
