#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform float yaw;
uniform float pitch;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float offset = vUv.x + yaw / (2.0 * 3.14159265);
  float horizonShift = pitch * 0.22;
  vec2 scrolledUv = vec2(fract(offset), fract(1.0 - vUv.y + horizonShift));
  fragColor = texture(tex, scrolledUv);
  gl_FragDepth = 1.0;
}
