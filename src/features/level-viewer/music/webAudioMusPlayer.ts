import { getSoundfontEngine } from './soundfontEngine';

export class WebAudioMusPlayer {
  private cacheKey: string | null = null;
  private stopped = true;

  unlockAudio(): void {
    void getSoundfontEngine().then((engine) => engine.unlockAudio());
  }

  async play(musData: ArrayBuffer, cacheKey: string): Promise<void> {
    this.stopped = false;

    if (typeof AudioContext === 'undefined') {
      throw new Error('Web Audio is not available in this environment.');
    }

    const engine = await getSoundfontEngine();
    if (this.stopped) return;

    await engine.unlockAudio();
    await engine.prepareMus(musData, cacheKey);
    if (this.stopped) return;

    this.cacheKey = cacheKey;
    await engine.playPrepared(cacheKey);
  }

  stop(): void {
    this.stopped = true;
    this.cacheKey = null;
    void getSoundfontEngine().then((engine) => engine.stop()).catch(() => {});
  }
}
