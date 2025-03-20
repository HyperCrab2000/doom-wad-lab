precision mediump float;
uniform sampler2D tex;
uniform float yaw;
varying vec2 vUv;

void main() {
    // Doom-style scrolling sky
    float offset = yaw / (2.0 * 3.141592) + vUv.x;
    vec2 scrolledUv = vec2(fract(offset), 1.0 - vUv.y);
    gl_FragColor = texture2D(tex, scrolledUv);
}