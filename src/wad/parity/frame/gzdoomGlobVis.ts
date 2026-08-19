/** GZDoom `R_GetGlobVis` + floor glob from `r_utility.cpp` / `r_light.cpp`. */

export function aspectTallerThanWide(aspect: number): boolean {
  return aspect < 1.333;
}

export function aspectBaseWidth(aspect: number): number {
  return Math.round(240 * aspect * 3);
}

export function aspectBaseHeight(aspect: number): number {
  if (!aspectTallerThanWide(aspect)) {
    const baseW = aspectBaseWidth(aspect);
    return Math.round(200 * (320 / (baseW / 3)) * 3);
  }
  return Math.round(((200 * (4 / 3)) / aspect) * 3);
}

export function aspectMultiplier(aspect: number): number {
  if (!aspectTallerThanWide(aspect)) {
    return Math.round((320 / (aspectBaseWidth(aspect) / 3)) * 48);
  }
  return Math.round((200 / (aspectBaseHeight(aspect) / 3)) * 48);
}

export function clampVisibility(vis: number): number {
  return Math.max(-204.7, Math.min(204.7, vis));
}

export interface GzdoomGlobVisParams {
  screenWidth: number;
  screenHeight: number;
  viewWidth: number;
  viewHeight: number;
  centerX: number;
  rVisibility?: number;
  focalTangent?: number;
  rYaspect?: number;
}

/** Wall glob constant from `R_GetGlobVis` (before dividing by screen Z). */
export function rGetGlobVis(params: GzdoomGlobVisParams): number {
  const {
    screenWidth,
    screenHeight,
    viewWidth,
    viewHeight,
    centerX,
    rVisibility = 8,
    focalTangent = 1,
    rYaspect = 1,
  } = params;

  const vis = clampVisibility(rVisibility);
  const widescreenRatio = screenWidth / Math.max(screenHeight, 1);
  const mult = aspectMultiplier(widescreenRatio);

  let virtWidth = screenWidth;
  let virtHeight = screenHeight;
  if (aspectTallerThanWide(widescreenRatio)) {
    virtHeight = (virtHeight * mult) / 48;
  } else {
    virtWidth = (virtWidth * mult) / 48;
  }

  const yAspectMul = (320 * virtHeight) / (200 * virtWidth);
  const invZtoScale = yAspectMul * centerX;

  let wallVisibility = vis;
  const maxVisForWall =
    (invZtoScale * (screenWidth * rYaspect)) / (viewWidth * screenHeight * focalTangent);
  const maxClamped = 32767 / Math.max(maxVisForWall, 1e-6);
  if (vis < 0 && vis < -maxClamped) wallVisibility = -maxClamped;
  else if (vis > 0 && vis > maxClamped) wallVisibility = maxClamped;

  const aspectBaseH = aspectBaseHeight(widescreenRatio);
  wallVisibility =
    ((invZtoScale * screenWidth * aspectBaseH) / (viewWidth * screenHeight * 3)) *
    (wallVisibility * focalTangent);

  return wallVisibility / focalTangent;
}

/** Floor/ceiling glob from `LightVisibility::SetVisibility` floor path. */
export function rGetFloorGlobVis(params: GzdoomGlobVisParams): number {
  const {
    screenWidth,
    screenHeight,
    viewWidth,
    viewHeight,
    centerX,
    rVisibility = 8,
    focalTangent = 1,
  } = params;

  const vis = clampVisibility(rVisibility);
  const widescreenRatio = screenWidth / Math.max(screenHeight, 1);
  const mult = aspectMultiplier(widescreenRatio);

  let virtWidth = screenWidth;
  let virtHeight = screenHeight;
  if (aspectTallerThanWide(widescreenRatio)) {
    virtHeight = (virtHeight * mult) / 48;
  } else {
    virtWidth = (virtWidth * mult) / 48;
  }

  const yAspectMul = (320 * virtHeight) / (200 * virtWidth);
  const invZtoScale = yAspectMul * centerX;
  const focalLengthY = invZtoScale;

  let floorVis = vis;
  const maxVisForFloor = (32767 / Math.max(viewHeight >> 2, 1)) * (focalLengthY / 160);
  if (vis < 0 && vis < -maxVisForFloor) floorVis = -maxVisForFloor;
  else if (vis > 0 && vis > maxVisForFloor) floorVis = maxVisForFloor;

  return (160 * floorVis) / Math.max(focalLengthY, 1e-6);
}

export function globVisFromPlayfield(
  canvasWidth: number,
  canvasHeight: number,
  viewWidth: number,
  viewHeight: number,
): { wallGlobVis: number; floorGlobVis: number } {
  const params: GzdoomGlobVisParams = {
    screenWidth: canvasWidth,
    screenHeight: canvasHeight,
    viewWidth,
    viewHeight,
    centerX: viewWidth / 2,
  };
  return {
    wallGlobVis: rGetGlobVis(params),
    floorGlobVis: rGetFloorGlobVis(params),
  };
}
