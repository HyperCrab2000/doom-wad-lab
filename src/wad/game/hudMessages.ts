export class HudMessageQueue {
  private text: string | null = null;
  private expiresAt = 0;

  clear(): void {
    this.text = null;
    this.expiresAt = 0;
  }

  push(message: string, durationMs = 3500, now = performance.now()): void {
    this.text = message;
    this.expiresAt = now + durationMs;
  }

  tick(now = performance.now()): void {
    if (this.text && now >= this.expiresAt) {
      this.text = null;
      this.expiresAt = 0;
    }
  }

  get(): string | null {
    return this.text;
  }
}
