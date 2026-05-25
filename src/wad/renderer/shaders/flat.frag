#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform sampler2D heightTex;
uniform float lightIntensity;
uniform vec3 ambientColor;
uniform vec3 glowColor;
uniform float glowStrength;
uniform float glowPulse;
uniform float glowHeight;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float visibilityDistance;
uniform vec3 liquidColor;
uniform float liquidStrength;
uniform float liquidEmissive;
uniform vec3 uCameraPos;
uniform float heightStrength;
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

in vec3 vNormal;
in vec2 vUv;
in float vWorldY;
in vec3 vWorldPos;

out vec4 fragColor;

#include "voxelParallax.glsl"

const float flatSize = 64.0;

vec3 radialLight(vec3 pos, vec3 color, float radius, float intensity, vec3 worldPos, bool enabled) {
  if (!enabled) return vec3(0.0);
  float dist = distance(pos, worldPos);
  float t = clamp(1.0 - dist / max(radius, 1.0), 0.0, 1.0);
  float falloff = t * t * (3.0 - 2.0 * t);
  return color * intensity * falloff;
}

void main() {
  vec3 N = normalize(vNormal);
  vec2 texCoord = vUv / flatSize;
  mat3 tbn = GetTBN(N, vWorldPos, texCoord);
  vec2 parallaxUv = ParallaxOcclusionMap(heightTex, tbn, texCoord, uCameraPos, vWorldPos, heightStrength);
  vec2 sampleUv = fract(parallaxUv);

  vec4 texVal = texture(tex, sampleUv);

  float h = GetHeightTexAt(heightTex, sampleUv);
  float hx = GetHeightTexAt(heightTex, fract(sampleUv + vec2(2.0 / flatSize, 0.0)));
  float hy = GetHeightTexAt(heightTex, fract(sampleUv + vec2(0.0, 2.0 / flatSize)));

  vec3 heightNormal = normalize(vec3(
    (h - hx) * heightStrength * 5.0,
    1.0,
    (h - hy) * heightStrength * 5.0
  ));
  vec3 normal = normalize(mix(N, heightNormal, heightStrength));
  vec3 lightDir = normalize(vec3(0.3, 1.0, 0.4));
  float directional = max(dot(normal, lightDir), 0.0);

  float baseLight = clamp(lightIntensity * pow(0.42 + 0.58 * directional, 1.2), 0.0, 2.0);

  float glowFade = glowHeight > 128.0
    ? 1.0
    : clamp(1.0 - (vWorldY / glowHeight), 0.0, 1.0);
  float pulse = glowPulse > 0.5
    ? 0.68 + 0.32 * sin(timeSeconds * 3.8 + vWorldPos.x * 0.05 + vWorldPos.z * 0.04)
    : 1.0;
  glowFade *= pulse;

  vec3 dynamicLight = vec3(0.0);
  dynamicLight += radialLight(uPointLightPosition0, uPointLightColor0, uPointLightRadius0, uPointLightIntensity0, vWorldPos, uPointLightCount > 0);
  dynamicLight += radialLight(uPointLightPosition1, uPointLightColor1, uPointLightRadius1, uPointLightIntensity1, vWorldPos, uPointLightCount > 1);
  dynamicLight += radialLight(uPointLightPosition2, uPointLightColor2, uPointLightRadius2, uPointLightIntensity2, vWorldPos, uPointLightCount > 2);
  dynamicLight += radialLight(uPointLightPosition3, uPointLightColor3, uPointLightRadius3, uPointLightIntensity3, vWorldPos, uPointLightCount > 3);
  float dynamicLevel = max(max(dynamicLight.r, dynamicLight.g), dynamicLight.b);
  vec3 litColor = texVal.rgb * (ambientColor + vec3(dynamicLevel * 0.32)) + dynamicLight * 0.34 + glowColor * glowFade * glowStrength;
  float relief = clamp((h - (hx + hy) * 0.5) * 5.5 + 0.65, 0.28, 1.65);
  litColor *= mix(1.0, relief, heightStrength);

  if (liquidStrength > 0.0) {
    vec2 pixelUv = floor(vUv / 8.0);
    float ripple = 0.5 + 0.5 * sin(pixelUv.x * 0.65 + pixelUv.y * 0.37 + timeSeconds * 4.0);

    if (liquidEmissive > 0.01) {
      float liquidMix = liquidStrength * (0.22 + ripple * 0.24);
      litColor = mix(litColor, liquidColor, liquidMix);
      litColor += liquidColor * ripple * liquidStrength * liquidEmissive * 0.28;
    } else {
      vec3 waterNormal = normalize(vec3(
        sin(pixelUv.x * 0.42 + timeSeconds * 3.0) * 0.1,
        1.0,
        cos(pixelUv.y * 0.36 + timeSeconds * 2.4) * 0.1
      ));
      float liquidMix = liquidStrength * (0.08 + ripple * 0.1);
      litColor = mix(litColor, liquidColor, liquidMix);

      vec3 viewDir = normalize(uCameraPos - vWorldPos);
      vec3 reflectDir = reflect(-lightDir, waterNormal);
      float spec = pow(max(dot(reflectDir, viewDir), 0.0), 56.0) * (0.25 + ripple * 0.35);
      float fresnel = pow(1.0 - max(dot(waterNormal, viewDir), 0.0), 2.5);
      vec3 skyReflect = mix(ambientColor, vec3(0.62, 0.72, 0.86), fresnel);
      vec3 lightReflect = (ambientColor + dynamicLight) * spec;
      litColor += (skyReflect * fresnel * 0.22 + lightReflect) * liquidStrength;
    }
  }

  float fogDepth = gl_FragCoord.z / gl_FragCoord.w;
  float sectorDistanceLight = clamp(1.0 - fogDepth / visibilityDistance, 0.08, 1.0);
  float fogFactor = clamp((fogDepth - 420.0) / mix(1400.0, 520.0, fogDensity), 0.0, 1.0);

  vec3 finalColor = mix(litColor * baseLight * sectorDistanceLight, fogColor, fogFactor);
  finalColor = pow(finalColor, vec3(1.0 / 2.2));

  fragColor = vec4(finalColor, texVal.a);
}
