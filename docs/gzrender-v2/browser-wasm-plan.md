# Browser / WASM / OpenGL Plan

## Goal

Port the core GZDoom-derived renderer path to WASM in the browser using browser-compatible OpenGL/WebGL2 first.

Native parity comes first. WASM comes after the native importer/renderer works.

## Target Sequence

1. Native OpenGL renderer for debugging.
2. Stripped native renderer that imports GZSTATE.
3. Node-generated GZSTATE parity.
4. WASM build of renderer-v2 core.
5. WebGL2/OpenGL ES-compatible browser backend.
6. Future WebGPU/raytracing backend.

## Performance Principles

- Avoid per-frame full state upload.
- Use binary packets, not object-by-object calls.
- Minimize JS/WASM boundary crossings.
- Keep persistent WASM-side memory.
- Use stable GPU handles/atlases where practical.
- Send only camera and dynamic patches per frame.
- Batch draw commands.

## Suggested WASM ABI

```c
gzr_create();
gzr_destroy();
gzr_load_state(uint8_t* data, int size);
gzr_set_camera(double x, double y, double z, double angle, double pitch, double fov);
gzr_apply_patches(uint8_t* data, int size);
gzr_tick(double deltaSeconds);
gzr_render_frame();
gzr_get_event_buffer(uint8_t** data, int* size);
gzr_clear_events();
gzr_get_debug_state(uint8_t** data, int* size);
gzr_get_stats(uint8_t** data, int* size);
gzr_get_last_error();
```

## JS Wrapper Concept

```ts
interface GzRendererV2 {
  loadState(buffer: ArrayBuffer): Promise<void>;
  setCamera(camera: CameraState): void;
  applyPatches(patches: RenderPatchBuffer): void;
  tick(dt: number): void;
  renderFrame(): void;
  drainEvents(): RendererEvent[];
  getDebugState(): unknown;
  setBackend(name: 'webgl2-classic' | 'webgpu-raytraced'): Promise<void>;
  dispose(): void;
}
```

## Raytracing Future-Proofing

Do not implement raytracing in the first pass. Design the backend boundary so a future WebGPU/raytracing renderer can consume the same GZSTATE and build its own acceleration structures.

Raytracing should be lazy-loaded, not part of the mandatory classic renderer bundle.
