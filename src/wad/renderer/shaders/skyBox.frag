#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform float yaw;
uniform float pitch;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float offset = vUv.x + yaw / (2.0 * 3.14159265);
  float horizonShift = clamp(pitch * 0.32, -0.28, 0.28);
  vec2 scrolledUv = vec2(fract(offset), clamp(1.0 - vUv.y + horizonShift, 0.0, 1.0));
  fragColor = texture(tex, scrolledUv);
  gl_FragDepth = 1.0;
}
