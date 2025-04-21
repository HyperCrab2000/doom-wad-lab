#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform float lightIntensity;

in vec3 vNormal;
in vec2 vUv;

out vec4 fragColor;
uniform vec3 ambientColor;

const float flatSize = 64.0;

void main() {
  vec4 texVal = texture(tex, fract(vUv / flatSize));

  // Directional lighting — static light from above-left
  vec3 lightDir = normalize(vec3(0.3, 1.0, 0.4));
  float directional = max(dot(normalize(vNormal), lightDir), 0.0);

  // Sector + fake distance-based attenuation
  float fakeDepth = clamp(gl_FragCoord.w * 500.0, 0.0, 1.0);
  float light = lightIntensity * (0.75 + 0.25 * directional) * fakeDepth;

  vec3 litColor = mix(texVal.rgb * ambientColor, texVal.rgb, 0.7);
  fragColor = vec4(litColor * light, texVal.a);

}
