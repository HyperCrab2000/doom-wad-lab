import { LineDef } from '@/wad/interfaces/LineDef';
import { getExitSpecial, ExitDef } from './exitSpecials';

export interface ExitTriggerResult {
  triggered: boolean;
  playSwitch: boolean;
  /** Level should end (vanilla exit). */
  requestExit: boolean;
}

export class ExitSystem {
  private readonly usedOnceLines = new Set<number>();
  private exitRequested = false;
  private secretExit = false;

  constructor() {}

  isExitRequested(): boolean {
    return this.exitRequested;
  }

  isSecretExit(): boolean {
    return this.secretExit;
  }

  clearExitRequest(): void {
    this.exitRequested = false;
    this.secretExit = false;
  }

  tryUseLine(lineIndex: number, line: LineDef): ExitTriggerResult {
    const def = getExitSpecial(line.special);
    if (!def || def.activation !== 'switch') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.trigger(lineIndex, line, def, true);
  }

  tryWalkLine(lineIndex: number, line: LineDef): ExitTriggerResult {
    const def = getExitSpecial(line.special);
    if (!def || def.activation !== 'walk') return emptyResult();
    if (def.repeat === 'once' && this.usedOnceLines.has(lineIndex)) return emptyResult();
    return this.trigger(lineIndex, line, def, false);
  }

  private trigger(
    lineIndex: number,
    line: LineDef,
    def: ExitDef,
    playSwitch: boolean
  ): ExitTriggerResult {
    this.exitRequested = true;
    this.secretExit = line.special === 51 || line.special === 124;
    if (def.repeat === 'once') {
      this.usedOnceLines.add(lineIndex);
    }
    return { triggered: true, playSwitch, requestExit: true };
  }
}

function emptyResult(): ExitTriggerResult {
  return { triggered: false, playSwitch: false, requestExit: false };
}
