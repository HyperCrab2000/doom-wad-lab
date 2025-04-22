#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform float lightIntensity;
uniform vec3 ambientColor;

in vec3 vNormal;
in vec2 vUv;

out vec4 fragColor;

const float flatSize = 64.0;

void main() {
  vec4 texVal = texture(tex, fract(vUv / flatSize));
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(vec3(0.3, 1.0, 0.4));
  float directional = max(dot(normal, lightDir), 0.0);

  float baseLight = lightIntensity * pow(0.6 + 0.4 * directional, 1.5);

  // Blend texture color with ambient tint (colorized light!)
  vec3 litColor = mix(texVal.rgb * ambientColor, texVal.rgb, 0.3);

  // Subtle fog (if wanted)
  float fogDepth = gl_FragCoord.z / gl_FragCoord.w;
  float fogFactor = clamp((fogDepth - 600.0) / 800.0, 0.0, 1.0);
  vec3 fogColor = ambientColor * 0.1 + vec3(0.02); // add dim bias

  vec3 finalColor = mix(litColor * baseLight, fogColor, fogFactor);
  finalColor = pow(finalColor, vec3(1.0 / 2.2)); // gamma

  fragColor = vec4(finalColor, texVal.a);
}
