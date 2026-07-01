#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform sampler2D heightTex;
uniform float lightIntensity;
uniform bool shouldClip;
uniform bool repeatVertical;
uniform vec3 ambientColor;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float visibilityDistance;
uniform float reliefStrength;
uniform vec3 uCameraPos;
uniform vec3 surfaceGlowColor;
uniform float surfaceGlowStrength;
uniform float surfaceGlowPulse;
uniform float timeSeconds;
uniform int uPointLightCount;
uniform vec3 uPointLightPosition0;
uniform vec3 uPointLightPosition1;
uniform vec3 uPointLightPosition2;
uniform vec3 uPointLightPosition3;
uniform vec3 uPointLightColor0;
uniform vec3 uPointLightColor1;
uniform vec3 uPointLightColor2;
uniform vec3 uPointLightColor3;
uniform float uPointLightRadius0;
uniform float uPointLightRadius1;
uniform float uPointLightRadius2;
uniform float uPointLightRadius3;
uniform float uPointLightIntensity0;
uniform float uPointLightIntensity1;
uniform float uPointLightIntensity2;
uniform float uPointLightIntensity3;

in vec2 vUv;
in float vParitySpanT;
in vec3 vWorldNormal;
in vec3 vWorldPos;

out vec4 fragColor;

#include "colormapParity.glsl"
#include "voxelParallax.glsl"

vec3 radialLight(vec3 pos, vec3 color, float radius, float intensity, vec3 worldPos, bool enabled) {
  if (!enabled) return vec3(0.0);
  float dist = distance(pos, worldPos);
  float t = clamp(1.0 - dist / max(radius, 1.0), 0.0, 1.0);
  float falloff = t * t * (3.0 - 2.0 * t);
  return color * intensity * falloff;
}

void main() {
  vec2 sampleUv = vUv;
  if (parityColormap == 0) {
    vec3 N = normalize(vWorldNormal);
    mat3 tbn = GetTBN(N, vWorldPos, vUv);
    sampleUv = ParallaxOcclusionMap(heightTex, tbn, vUv, uCameraPos, vWorldPos, reliefStrength);
    if (!repeatVertical) {
      sampleUv.y = clamp(sampleUv.y, 0.0, 1.0);
    }
  } else if (!repeatVertical) {
    sampleUv.y = clamp(sampleUv.y, 0.0, 1.0);
  }

  vec4 texColor = texture(tex, sampleUv);
  if (shouldClip && texColor.a < 0.1) discard;

  if (parityColormap != 0) {
    float visibility = wallVisibility();
    fragColor = vec4(sampleColormapParity(texColor, sectorLightLevel, visibility), texColor.a);
    return;
  }

  vec3 N = normalize(vWorldNormal);
  mat3 tbn = GetTBN(N, vWorldPos, vUv);
  float heightCenter = GetHeightTexAt(heightTex, sampleUv);
  float heightRight = GetHeightTexAt(heightTex, sampleUv + vec2(0.004, 0.0));
  float heightUp = GetHeightTexAt(heightTex, sampleUv + vec2(0.0, 0.004));

  float dhdU = (heightCenter - heightRight) * reliefStrength * 6.0;
  float dhdV = (heightCenter - heightUp) * reliefStrength * 6.0;
  vec3 normal = normalize(N - tbn[0] * dhdU - tbn[1] * dhdV);

  vec3 lightDir = normalize(vec3(0.3, 1.0, 0.4));
  float directional = max(dot(normal, lightDir), 0.0);
  float sideShade = 0.72 + 0.28 * abs(dot(normal, N));
  float baseLight = lightIntensity * pow(0.42 + 0.58 * directional, 1.15) * sideShade;

  float relief = clamp((heightCenter - (heightRight + heightUp) * 0.5) * 5.0 + 0.72, 0.45, 1.25);
  float glowPulse = surfaceGlowPulse > 0.5
    ? 0.72 + 0.28 * sin(timeSeconds * 3.4 + vWorldPos.x * 0.04 + vWorldPos.z * 0.03)
    : 1.0;
  vec3 surfaceGlow = surfaceGlowColor * surfaceGlowStrength * glowPulse;

  vec3 dynamicLight = vec3(0.0);
  dynamicLight += radialLight(uPointLightPosition0, uPointLightColor0, uPointLightRadius0, uPointLightIntensity0, vWorldPos, uPointLightCount > 0);
  dynamicLight += radialLight(uPointLightPosition1, uPointLightColor1, uPointLightRadius1, uPointLightIntensity1, vWorldPos, uPointLightCount > 1);
  dynamicLight += radialLight(uPointLightPosition2, uPointLightColor2, uPointLightRadius2, uPointLightIntensity2, vWorldPos, uPointLightCount > 2);
  dynamicLight += radialLight(uPointLightPosition3, uPointLightColor3, uPointLightRadius3, uPointLightIntensity3, vWorldPos, uPointLightCount > 3);
  float dynamicLevel = max(max(dynamicLight.r, dynamicLight.g), dynamicLight.b);
  vec3 litColor = texColor.rgb * (mix(ambientColor, vec3(1.0), 0.25) + vec3(dynamicLevel * 0.32));
  litColor += dynamicLight * 0.34 + surfaceGlow * 0.42;

  float fogDepth = gl_FragCoord.z / gl_FragCoord.w;
  float sectorDistanceLight = clamp(1.0 - fogDepth / visibilityDistance, 0.08, 1.0);
  float fogFactor = clamp((fogDepth - 420.0) / mix(1400.0, 520.0, fogDensity), 0.0, 1.0);

  vec3 finalColor = mix(litColor * baseLight * sectorDistanceLight * mix(1.0, relief, reliefStrength), fogColor, fogFactor);
  finalColor = pow(finalColor, vec3(1.0 / 2.2));

  fragColor = vec4(finalColor, texColor.a);
}
