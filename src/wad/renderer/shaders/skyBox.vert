// skybox.vert (Doom style)
attribute vec3 aPosition;
attribute vec2 aUv;

varying vec2 vUv;

void main() {
    vUv = aUv;
    gl_Position = vec4(aPosition.xy, 1.0, 1.0); // Render on far plane with no perspective distortion
}