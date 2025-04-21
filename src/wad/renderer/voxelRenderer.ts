import { mat4, vec3 } from 'gl-matrix';
import { createProgram, ShaderProgram } from 'apl-easy-gl';
import voxelVert from '@/assets/shaders/voxel/voxel.vert?raw';
import voxelFragRaw from '@/assets/shaders/voxel/voxelMaterial.glsl?raw';
import commonGLSL from '@/assets/shaders/voxel/common.glsl?raw';
import normalMapGLSL from '@/assets/shaders/voxel/normalMap.glsl?raw';
import specularMapGLSL from '@/assets/shaders/voxel/specularMap.glsl?raw';
import pbrGLSL from '@/assets/shaders/voxel/pbr.glsl?raw';
import parallaxGLSL from '@/assets/shaders/voxel/parallax.glsl?raw';

const voxelFrag = voxelFragRaw
  .replace('#include "common.glsl"', commonGLSL)
  .replace('#include "normalMap.glsl"', normalMapGLSL)
  .replace('#include "specularMap.glsl"', specularMapGLSL)
  .replace('#include "pbr.glsl"', pbrGLSL)
  .replace('#include "parallax.glsl"', parallaxGLSL);

export const voxelRenderer = {
  voxelShader: null as ShaderProgram | null,

  init(gl: WebGL2RenderingContext) {
    this.voxelShader = createProgram(gl, voxelVert, voxelFrag);

    if (!gl.getProgramParameter(this.voxelShader.program, gl.LINK_STATUS)) {
      console.error('❌ Shader link error:', gl.getProgramInfoLog(this.voxelShader.program));
      return;
    }

    // ✅ Bind context to methods to avoid `this` being undefined
    this.render = this.render.bind(this);
    this.renderWireframe = this.renderWireframe.bind(this);

    console.log('✅ voxelRenderer initialized successfully!');
  },

  render(gl: WebGL2RenderingContext, props: any) {
    const { mesh, position, rotation, viewMatrix, projectionMatrix, cameraPos, lightIntensity } =
      props;

    // Robust mesh sanity check:
    if (!mesh || !mesh.vertices || !mesh.indices) {
      console.warn('🚫 Skipped rendering invalid mesh:', mesh);
      return;
    }

    if (!mesh.vao) {
      // first-time VAO setup (like you already have)
    }

    // Cache VAO per mesh
    if (!mesh.vao) {
      // VAO setup if not initialized
      mesh.vao = gl.createVertexArray();
      mesh.vbo = gl.createBuffer();
      mesh.ibo = gl.createBuffer();

      gl.bindVertexArray(mesh.vao);

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
      const posLoc = gl.getAttribLocation(this.voxelShader!.program, 'aPosition');
      if (posLoc === -1) {
        console.error('❌ Attribute aPosition not found in shader!');
        return;
      }
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

      gl.bindVertexArray(null);
    }

    gl.useProgram(this.voxelShader!.program);
    gl.bindVertexArray(mesh.vao);

    const modelMatrix = mat4.create();
    mat4.translate(modelMatrix, modelMatrix, position);
    mat4.rotateY(modelMatrix, modelMatrix, rotation * (Math.PI / 180));

    const modelViewMatrix = mat4.create();
    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);

    const modelViewProjMatrix = mat4.create();
    mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

    const lightDir = vec3.normalize(vec3.create(), [-0.5, -1.0, -0.5]);

    this.voxelShader!.setUniforms({
      modelViewProj: modelViewProjMatrix,
      uCameraPos: cameraPos,
      uLightDir: lightDir,
      lightIntensity: lightIntensity ?? 1.0,
    });

    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  },

  renderWireframe(gl: WebGL2RenderingContext, mesh: any, viewMatrix: mat4, projectionMatrix: mat4) {
    console.log('🕸️ Attempting to render wireframe for debugging...');

    // Ensure mesh VAO is initialized properly
    if (!mesh.vao) {
      console.warn('❗ Mesh VAO not found. Initializing for wireframe...');
      mesh.vao = gl.createVertexArray();
      mesh.vbo = gl.createBuffer();
      mesh.ibo = gl.createBuffer();

      gl.bindVertexArray(mesh.vao);

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
      const posLoc = gl.getAttribLocation(this.voxelShader!.program, 'aPosition');
      if (posLoc === -1) {
        console.error('❌ Attribute aPosition not found in shader!');
        return;
      }
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

      gl.bindVertexArray(null);

      console.log('✅ VAO successfully initialized for wireframe!');

      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        console.error(`❌ WebGL error after VAO initialization: ${error}`);
      }
    }

    // ✅ Use voxelShader if initialized correctly
    if (!this.voxelShader || !this.voxelShader.program) {
      console.error('❌ voxelShader is not initialized!');
      return;
    }

    // ✅ Bind shader program and VAO
    gl.useProgram(this.voxelShader.program);
    gl.bindVertexArray(mesh.vao);

    // Setup transformation matrices for wireframe
    const modelMatrix = mat4.create();
    mat4.translate(modelMatrix, modelMatrix, [0, 0, 0]); // Center mesh

    const modelViewMatrix = mat4.create();
    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);

    const modelViewProjMatrix = mat4.create();
    mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

    // ✅ Set shader uniforms correctly for wireframe
    this.voxelShader.setUniforms({
      modelViewProj: modelViewProjMatrix,
    });

    // ✅ Draw wireframe as GL.LINES (edges only)
    gl.drawElements(gl.LINES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);

    // Unbind after rendering
    gl.bindVertexArray(null);
    console.log('✅ Wireframe rendered successfully!');
  },
};
