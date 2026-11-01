import { defocusBlurGLSL } from "./vendor/gl-transitions/defocus-blur";
/** One fixed, licensed shader. Both preview and export consume this same canvas. */
export class SoftTransition {
  private canvas = document.createElement("canvas");
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private textures: WebGLTexture[] = [];
  constructor() {
    const gl = this.canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) throw new Error("柔化溶解需要 WebGL，请改选交叉淡化后重试。");
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error("柔化转场 shader 编译失败: " + message);
      }
      return shader;
    };
    const vertex = compile(
      gl.VERTEX_SHADER,
      "attribute vec2 position; varying vec2 uv; void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.,1.);}",
    );
    const fragment = compile(
      gl.FRAGMENT_SHADER,
      `precision highp float; varying vec2 uv; uniform sampler2D fromTexture; uniform sampler2D toTexture; uniform float progress; uniform float ratio;
   vec2 aspectUV(vec2 p){return clamp(uv+(p-uv)*vec2(1.0/ratio,1.0),0.0,1.0);}
   vec4 getFromColor(vec2 p){return texture2D(fromTexture,aspectUV(p));}
   vec4 getToColor(vec2 p){return texture2D(toTexture,aspectUV(p));}
   ${defocusBlurGLSL}
   void main(){vec4 c=transition(uv);gl_FragColor=vec4(c.a>0.0?c.rgb/c.a:vec3(0.0),c.a);}`,
    );
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("柔化转场 shader 链接失败");
    this.program = program;
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    this.textures = [gl.createTexture()!, gl.createTexture()!];
  }
  render(
    from: HTMLCanvasElement,
    to: HTMLCanvasElement,
    progress: number,
  ): HTMLCanvasElement {
    if (progress <= 0) return from;
    if (progress >= 1) return to;
    const gl = this.gl;
    if (gl.isContextLost())
      throw new Error("WebGL 上下文已丢失，请重新打开预览或改选交叉淡化。");
    if (
      this.canvas.width !== from.width ||
      this.canvas.height !== from.height
    ) {
      this.canvas.width = from.width;
      this.canvas.height = from.height;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const location = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    for (const [i, input] of [from, to].entries()) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        input,
      );
      gl.uniform1i(
        gl.getUniformLocation(this.program, i ? "toTexture" : "fromTexture"),
        i,
      );
    }
    gl.uniform1f(gl.getUniformLocation(this.program, "progress"), progress);
    gl.uniform1f(
      gl.getUniformLocation(this.program, "ratio"),
      from.width / from.height,
    );
    gl.uniform1f(gl.getUniformLocation(this.program, "blurSize"), 0.018);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (gl.getError() !== gl.NO_ERROR)
      throw new Error("柔化转场 WebGL 绘制失败，请改选交叉淡化。");
    return this.canvas;
  }
  dispose() {
    const gl = this.gl;
    for (const t of this.textures) gl.deleteTexture(t);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
