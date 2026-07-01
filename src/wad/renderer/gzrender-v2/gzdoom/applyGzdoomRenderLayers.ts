import type { RenderLayerToggles } from '@/wad/renderer/modular/renderLayerToggles';

/**
 * Map doom-wad-lab Layers panel toggles → GZDoom `+cvar value` argv pairs (same CVARs as parity
 * display modes). Applied at WASM startup via callMain argv; live toggles use gzr_exec_cmd.
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

  // gl_fogmode / gl_bandedswlight are registered in hw_cvars / hw_drawinfo (GZRender WASM).
  // gl_lightmode and gl_light_sprites live in g_level / dynlight paths stripped from browser
  // builds — sending them prints "Unknown command" and breaks live layer toggles.
  pushInt('gl_fogmode', toggles.dynamicLighting ? 2 : 0);
  pushBool('gl_bandedswlight', !toggles.coloredLighting);

  if (toggles.meshTriangles) {
    pushBool('gl_texture', false);
  }

  return args;
}

/** Console commands for live CVAR updates (no WASM restart). */
export function buildGzdoomLayerConsoleCmds(toggles: RenderLayerToggles): string[] {
  const argv = buildGzdoomLayerArgv(toggles);
  const cmds: string[] = [];
  for (let i = 0; i + 1 < argv.length; i += 2) {
    const name = argv[i]!;
    const value = argv[i + 1]!;
    if (!name.startsWith('+')) continue;
    // AddCommandString expects console syntax (no leading +); + is argv-only startup syntax.
    cmds.push(`${name.slice(1)} ${value}`);
  }
  return cmds;
}

/** @deprecated Session key no longer triggers restart; kept for tests/diagnostics. */
export function gzdoomLayerSessionKey(toggles: RenderLayerToggles): string {
  return buildGzdoomLayerArgv(toggles).join('|');
}
