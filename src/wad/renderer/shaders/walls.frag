#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform float lightIntensity;
uniform bool shouldClip;
uniform vec3 ambientColor;

in vec2 vUv;
in vec3 vWorldNormal;

out vec4 fragColor;

void main() {
  vec4 texColor = texture(tex, vUv);
  if (shouldClip && texColor.a < 0.1) discard;

  vec3 normal = normalize(vWorldNormal);
  vec3 lightDir = normalize(vec3(0.3, 1.0, 0.4));
  float directional = max(dot(normal, lightDir), 0.0);
  float baseLight = lightIntensity * (0.6 + 0.4 * directional);

  vec3 litColor = mix(texColor.rgb * ambientColor, texColor.rgb, 0.5);

  float fogDepth = gl_FragCoord.z / gl_FragCoord.w;
  float fogFactor = clamp((fogDepth - 600.0) / 800.0, 0.0, 1.0);
  vec3 fogColor = vec3(0.06, 0.06, 0.07);

  vec3 finalColor = mix(litColor * baseLight, fogColor, fogFactor);
  finalColor = pow(finalColor, vec3(1.0 / 2.2)); // gamma correction

  fragColor = vec4(finalColor, texColor.a);
}
