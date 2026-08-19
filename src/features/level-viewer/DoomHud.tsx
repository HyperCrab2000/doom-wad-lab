import React, { useEffect, useRef } from 'react';
import type { Wad } from '@/wad/interfaces/Wad';
import { drawPatchImage, type PatchImage } from '@/wad/renderer/drawAssets/drawPatch';
import { drawStcfnTextAt } from '@/features/level-viewer/doomLoadingScreen';
import { findWadLump } from '@/features/level-viewer/doomWadGraphics';
import type { PlayerHudSnapshot } from '@/wad/game/playerInventory';
import type { StatusFaceLump } from '@/wad/game/statusFace';
import {
  resolveStatusFaceLumpName,
  STATUS_FACE_LUMPS,
} from '@/wad/game/statusFaceLumps';
import { computeHudLayout } from '@/features/level-viewer/doomHudLayout';
import {
  VANILLA_HUD,
  drawFaceBack,
  drawKeyCard,
  drawPatchAtAnchor,
  drawStPercentValue,
  drawStShortNumber,
  hudScreenToCanvas,
} from '@/features/level-viewer/doomStatusBarFonts';

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const deathRef = useRef<HTMLDivElement>(null);
  const stbarRef = useRef<PatchImage | null>(null);
  const facePatchesRef = useRef<Map<StatusFaceLump, PatchImage>>(new Map());

  useEffect(() => {
    stbarRef.current = null;
    facePatchesRef.current.clear();
    if (!wad) return;
    const stbarData = findWadLump(wad, 'STBAR');
    if (stbarData) {
      stbarRef.current = drawPatchImage(stbarData, wad.playpal);
    }
    for (const logical of STATUS_FACE_LUMPS) {
      const lumpName = resolveStatusFaceLumpName(wad, logical);
      if (!lumpName) continue;
      const lumpData = findWadLump(wad, lumpName);
      if (lumpData) {
        facePatchesRef.current.set(logical, drawPatchImage(lumpData, wad.playpal));
      }
    }
  }, [wad]);

  useEffect(() => {
    if (!active || !wad) return;

    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      const viewport = viewportRef.current;
      if (!canvas || !viewport) {
        frame = requestAnimationFrame(draw);
        return;
      }

      const width = Math.max(1, viewport.clientWidth);
      const height = Math.max(1, viewport.clientHeight);
      const layout = computeHudLayout(width, height);
      if (wrap) {
        wrap.style.height = `${layout.bandHeight}px`;
      }
      if (canvas.width !== width || canvas.height !== layout.canvasHeight) {
        canvas.width = width;
        canvas.height = layout.canvasHeight;
      }
      canvas.style.height = `${layout.canvasHeight}px`;

      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) {
        frame = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, width, layout.canvasHeight);
      const hud = getHudState();
      const { scale, barLeft, barY, barH } = layout;

      const stbar = stbarRef.current;
      if (stbar) {
        const barAnchor = hudScreenToCanvas(0, VANILLA_HUD.face.y, barLeft, barY, scale);
        drawPatchAtAnchor(ctx, stbar, barAnchor.x, barAnchor.y, scale);
      } else {
        ctx.fillStyle = 'rgba(72, 48, 40, 0.92)';
        ctx.fillRect(barLeft, barY, layout.barWidth, barH);
      }

      drawFaceBack(ctx, wad, VANILLA_HUD.face.x, VANILLA_HUD.face.y, barLeft, barY, scale);
      const facePatch = facePatchesRef.current.get(hud.faceLump);
      if (facePatch) {
        const faceAnchor = hudScreenToCanvas(VANILLA_HUD.face.x, VANILLA_HUD.face.y, barLeft, barY, scale);
        drawPatchAtAnchor(ctx, facePatch, faceAnchor.x, faceAnchor.y, scale);
      }

      drawStPercentValue(ctx, wad, hud.health, VANILLA_HUD.health.x, VANILLA_HUD.health.y, barLeft, barY, scale);
      drawStPercentValue(ctx, wad, hud.armor, VANILLA_HUD.armor.x, VANILLA_HUD.armor.y, barLeft, barY, scale);

      const ammoSlot = weaponAmmoSlot(hud.weapon);
      const ammoValue = getAmmoValue(hud, ammoSlot);
      drawStShortNumber(
        ctx,
        wad,
        ammoValue,
        VANILLA_HUD.ammo[ammoSlot].x,
        VANILLA_HUD.ammo[ammoSlot].y,
        barLeft,
        barY,
        scale
      );

      if (hud.keys.blue) {
        drawKeyCard(ctx, wad, 0, VANILLA_HUD.keys[0].x, VANILLA_HUD.keys[0].y, barLeft, barY, scale);
      }
      if (hud.keys.yellow) {
        drawKeyCard(ctx, wad, 1, VANILLA_HUD.keys[1].x, VANILLA_HUD.keys[1].y, barLeft, barY, scale);
      }
      if (hud.keys.red) {
        drawKeyCard(ctx, wad, 2, VANILLA_HUD.keys[2].x, VANILLA_HUD.keys[2].y, barLeft, barY, scale);
      }

      const powerupY = barY - 8 * scale;
      const powerupLabels: string[] = [];
      if (hud.powerups.invuln) powerupLabels.push('INV');
      if (hud.powerups.berserk) powerupLabels.push('BZK');
      if (hud.powerups.invis) powerupLabels.push('INVIS');
      if (hud.powerups.radSuit) powerupLabels.push('SUIT');
      if (hud.powerups.lightAmp) powerupLabels.push('LITE');
      if (hud.powerups.computerMap) powerupLabels.push('MAP');
      if (powerupLabels.length > 0) {
        drawStcfnTextAt(
          ctx,
          wad,
          powerupLabels.join(' '),
          barLeft + layout.barWidth * 0.5,
          powerupY,
          Math.max(1, scale - 1)
        );
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
      <div ref={wrapRef} className="doom-hud-wrap">
        <canvas ref={canvasRef} className="doom-hud" />
      </div>
    </div>
  );
};

function weaponAmmoSlot(weapon: string): 0 | 1 | 2 | 3 {
  switch (weapon) {
    case 'shotgun':
    case 'superShotgun':
      return 1;
    case 'rocket':
      return 2;
    case 'plasma':
    case 'bfg':
      return 3;
    case 'pistol':
    case 'chaingun':
    case 'chainsaw':
    case 'fist':
    default:
      return 0;
  }
}

function getAmmoValue(hud: HudState, slot: 0 | 1 | 2 | 3): number {
  switch (slot) {
    case 0:
      return hud.ammo.bullets;
    case 1:
      return hud.ammo.shells;
    case 2:
      return hud.ammo.rockets;
    case 3:
      return hud.ammo.cells;
  }
}
