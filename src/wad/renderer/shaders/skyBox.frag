precision mediump float;
uniform sampler2D tex;
uniform float yaw;
uniform float pitch;
varying vec2 vUv;

void main() {
    // Doom-style cylindrical sky: horizontal wrap follows view yaw.
    // Pitch shifts the horizon but keeps the sky as a wall-like panorama, not a cube.
    float offset = vUv.x + yaw / (2.0 * 3.14159265);
    float horizonShift = clamp(pitch * 0.32, -0.28, 0.28);
    vec2 scrolledUv = vec2(fract(offset), clamp(1.0 - vUv.y + horizonShift, 0.0, 1.0));
    gl_FragColor = texture2D(tex, scrolledUv);
    gl_FragDepth = 1.0;
}