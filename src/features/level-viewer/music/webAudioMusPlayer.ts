import { getSoundfontEngine } from './soundfontEngine';

export class WebAudioMusPlayer {
  private cacheKey: string | null = null;
  private stopped = true;
  private generation = 0;

  unlockAudio(): void {
    void getSoundfontEngine().then((engine) => engine.unlockAudio());
  }

  async play(musData: ArrayBuffer, cacheKey: string): Promise<void> {
    const generation = ++this.generation;
    this.stopped = false;

    if (typeof AudioContext === 'undefined') {
      throw new Error('Web Audio is not available in this environment.');
    }

    const engine = await getSoundfontEngine();
    if (this.stopped || generation !== this.generation) return;

    await engine.unlockAudio();
    if (this.stopped || generation !== this.generation) return;

    await engine.prepareMus(musData, cacheKey);
    if (this.stopped || generation !== this.generation) return;

    this.cacheKey = cacheKey;
    await engine.playPrepared(cacheKey);
  }

  stop(): void {
    this.stopped = true;
    this.cacheKey = null;
    const generation = ++this.generation;
    void getSoundfontEngine()
      .then((engine) => {
        if (generation === this.generation) {
          engine.stop();
        }
      })
      .catch(() => {});
  }
}
