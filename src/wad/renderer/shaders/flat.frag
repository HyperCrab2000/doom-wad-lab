#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform float lightIntensity;

in vec3 vNormal;
in vec2 vUv;

out vec4 fragColor;

const float flatSize = 64.0;

void main() {
  vec4 texVal = texture(tex, fract(vUv / flatSize));

  // Directional lighting — static light from above-left
  vec3 lightDir = normalize(vec3(0.3, 1.0, 0.4));
  float directional = max(dot(normalize(vNormal), lightDir), 0.0);

  // Sector + fake distance-based attenuation
  float fakeDepth = clamp(gl_FragCoord.w * 500.0, 0.0, 1.0);
  float light = lightIntensity * (0.75 + 0.25 * directional) * fakeDepth;

  fragColor = vec4(texVal.rgb * light, texVal.a);
}
