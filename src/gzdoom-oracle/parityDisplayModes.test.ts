import { describe, expect, it } from 'vitest';

import {
  buildParityCaptureArgv,
  DISPLAY_MODE_CORPUS_ORDER,
  displayModeRefFilename,
  inferParityFailureLayer,
  parseDisplayModeId,
} from './parityDisplayModes';

describe('parityDisplayModes', () => {
  it('parses mode ids', () => {
    expect(parseDisplayModeId('notexture')).toBe('notexture');
    expect(parseDisplayModeId(undefined)).toBe('full');
  });

  it('maps ref filenames', () => {
    expect(displayModeRefFilename('full')).toBe('ref.png');
    expect(displayModeRefFilename('no-fog')).toBe('ref-no-fog.png');
  });

  it('appends mode cvars after baseline', () => {
    const argv = buildParityCaptureArgv('notexture');
    expect(argv).toContain('+gl_texture');
    expect(argv[argv.indexOf('+gl_texture') + 1]).toBe('0');
    expect(argv).toContain('+gl_es');
  });

  it('infers lighting layer when notexture passes but full fails', () => {
    const layer = inferParityFailureLayer({
      full: false,
      notexture: true,
      geometry: true,
      'walls-only': true,
      'flats-only': true,
    });
    expect(layer).toBe('texturing-or-lighting-shader');
  });

  it('infers colormap when all draw-path splits fail like full', () => {
    const layer = inferParityFailureLayer({
      full: false,
      notexture: false,
      'walls-only': false,
      'flats-only': false,
      geometry: false,
      'no-fog': false,
    });
    expect(layer).toBe('lighting-colormap-shader');
  });

  it('corpus order starts with full', () => {
    expect(DISPLAY_MODE_CORPUS_ORDER[0]).toBe('full');
  });
});
