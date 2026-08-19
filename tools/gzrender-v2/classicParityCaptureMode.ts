/** Default: normal play spawn (honest parity gates). Opt into frameParity oracle with CLASSIC_PARITY_FRAME=1. */
export function useClassicFrameParityCapture(): boolean {
  if (process.env.CLASSIC_PARITY_FRAME === '1') return true;
  if (process.env.CLASSIC_PARITY_PLAY === '0') return true;
  return false;
}

export function classicParityCaptureEnv(): Record<string, string> {
  return useClassicFrameParityCapture()
    ? { CLASSIC_PARITY_FRAME: '1' }
    : { CLASSIC_PARITY_PLAY: '1' };
}
