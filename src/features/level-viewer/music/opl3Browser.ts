import type { Opl3Format, Opl3PlayerOptions, Player } from 'opl3';

export type Opl3Player = Player;

export interface Opl3Module {
  Player: typeof Player;
  format: {
    MUS: Opl3Format;
  };
}

interface Opl3Bundle {
  Player: typeof Player;
  format: {
    MUS: Opl3Format;
  };
}

declare global {
  interface Window {
    OPL3?: Opl3Bundle;
  }
}

const OPL3_SCRIPT_URL = '/vendor/opl3.js';

let modulePromise: Promise<Opl3Module> | null = null;
let scriptPromise: Promise<void> | null = null;

function loadOpl3Script(): Promise<void> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.reject(new Error('OPL3 browser bundle requires a DOM environment.'));
  }

  if (window.OPL3?.Player && window.OPL3.format?.MUS) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-opl3-bundle="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load OPL3 browser bundle.')), {
        once: true,
      });
      if (window.OPL3?.Player) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = OPL3_SCRIPT_URL;
    script.async = true;
    script.dataset.opl3Bundle = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load OPL3 browser bundle from ${OPL3_SCRIPT_URL}.`));
    document.head.appendChild(script);
  }).then(() => {
    if (!window.OPL3?.Player || !window.OPL3.format?.MUS) {
      throw new Error('OPL3 browser bundle loaded but did not expose Player/MUS.');
    }
  });

  return scriptPromise;
}

export function getOpl3Module(): Promise<Opl3Module> {
  if (!modulePromise) {
    modulePromise = loadOpl3Script().then(() => {
      const bundle = window.OPL3!;
      return {
        Player: bundle.Player,
        format: { MUS: bundle.format.MUS },
      };
    });
  }
  return modulePromise;
}

export type { Opl3PlayerOptions };
