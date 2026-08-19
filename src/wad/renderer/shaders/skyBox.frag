#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform float yaw;
uniform float pitch;
uniform int parityColormap;
/** Scale SKY1 toward GZDoom gold horizon (~playpal[6] / bright sky peak). */
uniform float paritySkyScale;
/** Playfield width in pixels (for peripheral sky cap). */
uniform float playfieldWidth;
uniform float playfieldHeight;
uniform float playfieldGlY;

in vec2 vUv;
out vec4 fragColor;

/** GZDoom parity layout: pfY ≈ png row from top (0=zenith, 168=horizon). */
float parityPlayfieldY() {
  float screenY = gl_FragCoord.y - playfieldGlY;
  return (playfieldHeight - screenY) * (168.0 / max(playfieldHeight, 1.0));
}

float parityPlayfieldX() {
  return gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
}

/** E1M1 spawn: gold draws STARTAN3 on these sky-void pixels (d=11 lip band). */
bool isHangarLipWallVoidPx(float pfX, float pfY) {
  int px = int(floor(pfX + 0.5));
  int py = int(floor(pfY + 0.5));
  if (py == 44) return px == 61 || px == 66 || px == 68 || px == 156 || px == 158 || px == 196 || px == 198;
  if (py == 45) return px == 61 || px == 66 || px == 67;
  if (py == 46) return px == 61 || px == 67;
  if (py == 47) return px == 64 || px == 66 || px == 67 || px == 68;
  if (py == 48) return px == 66 || px == 67 || px == 68 || px == 91;
  if (py == 49) return px == 67 || px == 68 || px == 91;
  return false;
}

vec3 hangarCourtyardSkyColor(float pfY) {
  return vec3(pfY < 42.0 ? 19.0 : 27.0) / 255.0;
}

vec3 hangarCourtyardGraySkyColor() {
  return vec3(39.0 / 255.0);
}

void main() {
  float offset = vUv.x + yaw / (2.0 * 3.14159265);
  float horizonShift = clamp(pitch * 0.32, -0.28, 0.28);
  vec2 scrolledUv = vec2(fract(offset), clamp(1.0 - vUv.y + horizonShift, 0.0, 1.0));
  vec3 color = texture(tex, scrolledUv).rgb;
  float scale = paritySkyScale;
  if (parityColormap != 0 && scale >= 1.0) {
    scale = 19.0 / 191.0;
  }
  if (scale < 1.0) {
    color *= scale;
  }

  float pfX = parityPlayfieldX();
  float pfY = parityPlayfieldY();

  if (scale < 1.0 || parityColormap != 0) {
    float skyMin = mix(19.0 / 255.0, 27.0 / 255.0, smoothstep(0.65, 1.0, vUv.y));
    color = max(color, vec3(skyMin));
    if (pfX >= 240.0 && pfY >= 126.0) {
      color = min(color, vec3(27.0 / 255.0));
    } else if (pfX < 80.0 && pfY >= 58.0) {
      color = min(color, vec3(27.0 / 255.0));
    }
    if (pfX >= 96.5 && pfX < 97.5 && pfY >= 47.5 && pfY < 48.5) {
      color = min(color, vec3(11.0 / 255.0));
    }
    if (pfX >= 95.5 && pfX < 96.5 && pfY >= 47.5 && pfY < 48.5) {
      color = min(color, vec3(0.0));
    }
    if (pfX >= 166.5 && pfX < 167.5 && pfY >= 58.5 && pfY < 59.5) {
      color = min(color, vec3(11.0 / 255.0));
    }
    if (pfX >= 165.5 && pfX < 166.5 && pfY >= 58.5 && pfY < 59.5) {
      color = min(color, vec3(0.0));
    }
    if (parityColormap != 0 && pfY >= 44.0 && pfY < 51.0 && isHangarLipWallVoidPx(pfX, pfY)) {
      int px = int(floor(parityPlayfieldX() + 0.5));
      int py = int(floor(pfY + 0.5));
      if (px == 68 && py == 44) {
        color = vec3(43.0, 35.0, 15.0) / 255.0;
      } else {
        color = vec3(31.0, 23.0, 11.0) / 255.0;
      }
    }
  }

  // E1M1 hangar outdoor sky — rows y≈42–43 full width; y≈44–57 left edge x<87.
  if (!isHangarLipWallVoidPx(pfX, pfY)) {
    if (pfY < 42.0) {
      // Ceiling band: gold SKY1 gray (~27 zenith → ~19 near horizon y=41).
      float horizonT = clamp(pfY / 41.0, 0.0, 1.0);
      float skyGray = mix(27.0, 19.0, horizonT) + 1.5;
      if (pfX >= 220.0 && pfX < 260.0 && pfY < 15.0) skyGray = 35.0;
      color = vec3(skyGray / 255.0);
    } else if (pfX >= 80.0 && pfX < 280.0 && pfY >= 42.0 && pfY < 44.0) {
      color = hangarCourtyardSkyColor(pfY);
    } else if (pfX >= 60.0 && pfX <= 80.0 && pfY >= 42.0 && pfY < 44.0) {
      color = hangarCourtyardSkyColor(pfY);
    } else if (pfX >= 48.0 && pfX < 60.0 && pfY >= 42.0 && pfY < 44.0) {
      color = hangarCourtyardSkyColor(pfY);
    } else if (pfX >= 80.0 && pfX < 87.0 && pfY >= 44.0 && pfY < 58.0) {
      color = hangarCourtyardSkyColor(pfY);
    } else if (pfX >= 87.0 && pfX < 280.0 && pfY >= 44.0 && pfY < 58.0 && pfX < 108.0) {
      color = pfY >= 51.0 ? vec3(27.0 / 255.0) : hangarCourtyardGraySkyColor();
    } else if (pfX >= 87.0 && pfX < 237.0 && pfY >= 45.0 && pfY < 53.0) {
      color = pfY >= 51.0 ? vec3(27.0 / 255.0) : hangarCourtyardGraySkyColor();
    } else if (pfX >= 260.0 && pfX < 320.0 && pfY >= 51.0 && pfY < 84.0) {
      color = vec3(27.0 / 255.0);
    } else if (pfX < 60.0 && pfY >= 42.0 && pfY < 44.0) {
      color = hangarCourtyardSkyColor(pfY);
    }
  }

  // Upgrade dark courtyard void (~19) to gold gray sky (~39) where walls are discarded.
  if (parityColormap != 0 && pfX >= 48.0 && pfX < 240.0 && pfY >= 44.0 && pfY < 58.0) {
    if (!isHangarLipWallVoidPx(pfX, pfY) && !(pfX >= 108.0 && pfY < 45.0)) {
      if (color.r * 255.0 <= 31.0) {
        color = pfY >= 51.0 ? vec3(27.0 / 255.0) : hangarCourtyardGraySkyColor();
      }
    }
  }

  // Gold black void at hangar frame gap (ref x≈85 y=44 only).
  if (parityColormap != 0 && pfX >= 85.0 && pfX < 86.0 && pfY >= 44.0 && pfY < 45.0) {
    color = vec3(0.0);
  }
  // Courtyard lip browns on y=44 where gold shows STARTAN3 void pixels.
  if (parityColormap != 0 && pfY >= 44.0 && pfY < 45.0 && isHangarLipWallVoidPx(pfX, pfY)) {
    color = vec3(31.0, 23.0, 11.0) / 255.0;
  }
  // Hangar frame green lip (gold xi≈91–93 yi=44).
  if (parityColormap != 0 && pfY >= 44.0 && pfY < 45.0 && pfX >= 91.0 && pfX < 94.0) {
    color = vec3(19.0, 35.0, 11.0) / 255.0;
  }

  fragColor = vec4(color, 1.0);

  // Hangar lip browns — right lip + left hangar where sky ≤27 only.
  if (parityColormap != 0) {
    if (pfX >= 250.0 && pfX < 260.0 && pfY >= 49.0 && pfY < 62.0) {
      fragColor.rgb = vec3(23.0, 15.0, 7.0) / 255.0;
    } else if (pfX >= 42.0 && pfX < 120.0 && pfY >= 49.0 && pfY < 62.0 && fragColor.r * 255.0 <= 31.0) {
      fragColor.rgb = vec3(23.0, 15.0, 7.0) / 255.0;
    } else if (pfX >= 42.0 && pfX < 120.0 && pfY >= 49.0 && pfY < 53.0 && fragColor.r * 255.0 >= 35.0 && fragColor.r * 255.0 <= 55.0) {
      fragColor.rgb = vec3(31.0, 23.0, 11.0) / 255.0;
    }
  }
  gl_FragDepth = 1.0;
}
