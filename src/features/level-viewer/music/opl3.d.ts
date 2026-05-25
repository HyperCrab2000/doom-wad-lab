declare module 'opl3/lib/player.js' {
  import { Player } from 'opl3';
  export default Player;
}

declare module 'opl3/format/mus.js' {
  import { Opl3Format } from 'opl3';
  const MUS: Opl3Format;
  export default MUS;
}

declare module 'opl3/dist/opl3.js' {
  import { format, Player } from 'opl3';
  const OPL3: {
    Player: typeof Player;
    format: typeof format;
  };
  export default OPL3;
}

declare module 'opl3' {
  export class OPL3 {
    read(buffer: Float32Array | Int16Array): void;
  }

  export interface Opl3Format {
    name: string;
    new (opl: OPL3, options?: Opl3PlayerOptions): unknown;
  }

  export interface Opl3PlayerOptions {
    instruments?: ArrayBuffer;
    prebuffer?: number;
    volume?: number;
    bufferSize?: number;
    sampleRate?: number;
    bitDepth?: number;
    disableWorker?: boolean;
    normalization?: boolean;
  }

  export class Player {
    constructor(format: Opl3Format, options?: Opl3PlayerOptions);
    play(buffer: ArrayBuffer): void;
    pause(): void;
    load(buffer: ArrayBuffer): Promise<ArrayBuffer>;
    abort?: () => void;
    on(event: 'position' | 'progress' | 'end' | 'error' | 'abort', callback: (...args: unknown[]) => void): void;
    position: number;
    length: number;
    volume: number;
  }

  export const format: {
    MUS: Opl3Format;
    LAA: Opl3Format;
    DRO: Opl3Format;
    IMF: Opl3Format;
    RAW: Opl3Format;
  };
}
