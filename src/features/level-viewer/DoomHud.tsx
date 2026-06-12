import React, { useEffect, useRef } from 'react';
import type { Wad } from '@/wad/interfaces/Wad';
import { drawPatch } from '@/wad/renderer/drawAssets/drawPatch';
import { drawStcfnTextAt } from '@/features/level-viewer/doomLoadingScreen';
import { findWadLump } from '@/features/level-viewer/doomWadGraphics';
import type { PlayerHudSnapshot } from '@/wad/game/playerInventory';
import type { StatusFaceLump } from '@/wad/game/statusFace';

const BAR_HEIGHT = 32;
const HUD_SCALE = 2;
/** Bottom band only — never cover the full viewport with a 2D canvas (breaks WebGL compositing). */
const HUD_BAND_HEIGHT = 96;

const WEAPON_LABELS: Record<string, string> = {
  fist: 'FIST',
  pistol: 'PIST',
  chainsaw: 'SAW',
  shotgun: 'SGN',
  chaingun: 'MGUN',
  rocket: 'LNCH',
  plasma: 'PLAS',
  bfg: 'BFG',
  superShotgun: 'SGN2',
};

export type HudState = PlayerHudSnapshot & {
  message: string | null;
  faceLump: StatusFaceLump;
  powerups: {
    invuln: boolean;
    berserk: boolean;
    invis: boolean;
    radSuit: boolean;
    lightAmp: boolean;
    computerMap: boolean;
  };
};

export interface DoomHudProps {
  active: boolean;
  wad: Wad | null;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  getHudState: () => HudState;
}

export const DoomHud: React.FC<DoomHudProps> = ({ active, wad, viewportRef, getHudState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const deathRef = useRef<HTMLDivElement>(null);
  const stbarRef = useRef<ReturnType<typeof drawPatch> | null>(null);
  const facePatchesRef = useRef<Map<string, ReturnType<typeof drawPatch>>>(new Map());

  useEffect(() => {
    stbarRef.current = null;
    facePatchesRef.current.clear();
    if (!wad) return;
    const data = findWadLump(wad, 'STBAR');
    if (data) {
      stbarRef.current = drawPatch(data, wad.playpal);
    }
    const faceLumps: StatusFaceLump[] = [
      'STFGOD0',
      'STFSTF0',
      'STFSTF1',
      'STFSTF2',
      'STFSTF3',
      'STFSTF4',
      'STFDEAD0',
      'STFKILL0',
    ];
    for (const lump of faceLumps) {
      const lumpData = findWadLump(wad, lump);
      if (lumpData) {
        facePatchesRef.current.set(lump, drawPatch(lumpData, wad.playpal));
      }
    }
  }, [wad]);

  useEffect(() => {
    if (!active || !wad) return;

    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const viewport = viewportRef.current;
      if (!canvas || !viewport) {
        frame = requestAnimationFrame(draw);
        return;
      }

      const width = Math.max(1, viewport.clientWidth);
      const bandHeight = HUD_BAND_HEIGHT;
      if (canvas.width !== width || canvas.height !== bandHeight) {
        canvas.width = width;
        canvas.height = bandHeight;
      }

      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) {
        frame = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, width, bandHeight);
      const hud = getHudState();
      const barY = bandHeight - BAR_HEIGHT;

      const stbar = stbarRef.current;
      if (stbar) {
        const barW = stbar.canvas.width;
        const barH = stbar.canvas.height;
        const scaleX = width / barW;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(stbar.canvas, 0, barY, width, barH * scaleX);
      } else {
        ctx.fillStyle = 'rgba(72, 48, 40, 0.92)';
        ctx.fillRect(0, barY, width, BAR_HEIGHT);
        ctx.strokeStyle = '#2a1810';
        ctx.lineWidth = 2;
        ctx.strokeRect(0.5, barY + 0.5, width - 1, BAR_HEIGHT - 1);
      }

      const healthText = `${Math.max(0, hud.health)}%`;
      const armorText = `${Math.max(0, hud.armor)}%`;
      const weaponLabel = WEAPON_LABELS[hud.weapon] ?? hud.weapon.toUpperCase();
      const activeAmmo = getActiveAmmoDisplay(hud);

      const facePatch = facePatchesRef.current.get(hud.faceLump);
      if (facePatch) {
        const faceScale = Math.max(2, Math.floor((width / 320) * 2));
        const faceW = facePatch.canvas.width * faceScale;
        const faceH = facePatch.canvas.height * faceScale;
        const faceX = width * (143 / 320) - faceW * 0.5;
        const faceY = barY - faceH + 4;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(facePatch.canvas, faceX, faceY, faceW, faceH);
      }

      const powerupY = barY - 28;
      const powerupLabels: string[] = [];
      if (hud.powerups.invuln) powerupLabels.push('INV');
      if (hud.powerups.berserk) powerupLabels.push('BZK');
      if (hud.powerups.invis) powerupLabels.push('INVIS');
      if (hud.powerups.radSuit) powerupLabels.push('SUIT');
      if (hud.powerups.lightAmp) powerupLabels.push('LITE');
      if (hud.powerups.computerMap) powerupLabels.push('MAP');
      if (powerupLabels.length > 0) {
        drawStcfnTextAt(ctx, wad, powerupLabels.join(' '), width * 0.5, powerupY, HUD_SCALE - 1);
      }

      const baseline = bandHeight - 6;
      drawStcfnTextAt(ctx, wad, healthText, 16, baseline, HUD_SCALE);
      drawStcfnTextAt(ctx, wad, armorText, width * 0.38, baseline, HUD_SCALE);
      drawStcfnTextAt(ctx, wad, weaponLabel, width * 0.58, baseline, HUD_SCALE);
      drawStcfnTextAt(ctx, wad, activeAmmo, width - 96, baseline, HUD_SCALE);

      const keyY = barY - 14;
      const keys: string[] = [];
      if (hud.keys.blue) keys.push('B');
      if (hud.keys.yellow) keys.push('Y');
      if (hud.keys.red) keys.push('R');
      if (keys.length > 0) {
        drawStcfnTextAt(ctx, wad, keys.join(' '), 12, keyY, HUD_SCALE);
      }

      if (messageRef.current) {
        messageRef.current.textContent = hud.message ?? '';
        messageRef.current.hidden = !hud.message;
      }
      if (deathRef.current) {
        deathRef.current.hidden = hud.alive;
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active, wad, viewportRef, getHudState]);

  if (!active) return null;

  return (
    <div className="doom-hud-layer" aria-hidden={!active}>
      <div ref={messageRef} className="doom-hud-message" hidden />
      <div ref={deathRef} className="doom-hud-message doom-hud-message--death" hidden>
        YOU DIED
      </div>
      <div className="doom-hud-wrap">
        <canvas ref={canvasRef} className="doom-hud" />
      </div>
    </div>
  );
};

function getActiveAmmoDisplay(hud: HudState): string {
  switch (hud.weapon) {
    case 'pistol':
    case 'chaingun':
      return String(hud.ammo.bullets);
    case 'shotgun':
    case 'superShotgun':
      return String(hud.ammo.shells);
    case 'rocket':
      return String(hud.ammo.rockets);
    case 'plasma':
    case 'bfg':
      return String(hud.ammo.cells);
    case 'chainsaw':
    case 'fist':
    default:
      return '--';
  }
}
