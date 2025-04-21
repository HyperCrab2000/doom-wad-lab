#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform float lightIntensity;
uniform bool shouldClip;

in vec2 vUv;
in vec3 vWorldNormal;

out vec4 fragColor;

void main() {
  vec4 texColor = texture(tex, vUv);

  // Discard transparent pixels (e.g. grates, trees)
  if (shouldClip && texColor.a < 0.1) discard;

  vec3 lightDir = normalize(vec3(0.3, 1.0, 0.4));
  float lighting = max(dot(vWorldNormal, lightDir), 0.0);

  // Combine DOOM-style lightIntensity with directional light
  float finalLight = lightIntensity * (0.75 + 0.25 * lighting);

  fragColor = vec4(texColor.rgb * finalLight, texColor.a);
}
