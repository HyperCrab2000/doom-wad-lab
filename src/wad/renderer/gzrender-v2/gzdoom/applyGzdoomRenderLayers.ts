import type { RenderLayerToggles } from '@/wad/renderer/modular/renderLayerToggles';

/**
 * Map doom-wad-lab Layers panel toggles → GZDoom `+cvar value` argv pairs (same CVARs as parity
 * display modes). Applied at WASM startup via callMain argv — no Emscripten exports, no JS rendering.
 */
export function buildGzdoomLayerArgv(toggles: RenderLayerToggles): string[] {
  const args: string[] = [];
  const pushBool = (name: string, value: boolean) => {
    args.push(`+${name}`, value ? '1' : '0');
  };
  const pushInt = (name: string, value: number) => {
    args.push(`+${name}`, String(value));
  };

  const wf = toggles.wireframeMode;

  if (wf !== 'off') {
    pushBool('gl_texture', false);
    pushBool('gl_render_things', false);
    switch (wf) {
      case 'bsp':
      case 'sight':
        pushBool('gl_render_walls', true);
        pushBool('gl_render_flats', false);
        break;
      case 'mesh':
        pushBool('gl_render_walls', true);
        pushBool('gl_render_flats', true);
        break;
      default:
        break;
    }
    if (toggles.meshTriangles) {
      pushBool('gl_texture', false);
    }
    return args;
  }

  pushBool('gl_render_walls', toggles.solidWalls);
  pushBool('gl_render_flats', toggles.solidFloors || toggles.solidCeilings);

  const drawThings =
    toggles.voxels ||
    toggles.solidWalls ||
    toggles.solidFloors ||
    toggles.solidCeilings;
  pushBool('gl_render_things', drawThings);

  const useTextures =
    (toggles.solidWalls && toggles.wallTextures) ||
    ((toggles.solidFloors || toggles.solidCeilings) &&
      (toggles.floorTextures || toggles.ceilingTextures)) ||
    toggles.animatedLiquid;
  pushBool('gl_texture', useTextures);

  pushBool('gl_portals', toggles.sky);
  pushBool('gl_noskyboxes', !toggles.sky);

  pushInt('gl_fogmode', toggles.dynamicLighting ? 2 : 0);
  pushInt('gl_lightmode', toggles.coloredLighting ? 1 : 0);
  pushBool('gl_light_sprites', toggles.dynamicLighting);

  if (toggles.meshTriangles) {
    pushBool('gl_texture', false);
  }

  return args;
}

/** Stable session key fragment when layer toggles change (forces GZDoom WASM restart with new argv). */
export function gzdoomLayerSessionKey(toggles: RenderLayerToggles): string {
  return buildGzdoomLayerArgv(toggles).join('|');
}
