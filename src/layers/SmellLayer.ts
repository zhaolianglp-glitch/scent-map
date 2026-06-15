// SmellLayer: MapLibre Custom Layer — 浓度场 FBO 管线
//
// 每帧流程：
//   1. Advection Pass  — 从 readFBO 采样，Curl Noise + 风场 warp → writeFBO
//   2. Draw Smells Pass — 将气味点以径向渐变笔刷注入 writeFBO（加法混合）
//   3. Swap FBOs         — read ↔ write
//   4. Display Pass      — 将 readFBO 渲染到屏幕（含 Bloom 光晕）
//
// 与旧版的关键区别：
//   - 不再逐点画精灵，而是维护一个浓度场纹理
//   - 实现了真正的 Curl Noise 流场推进
//   - 屏幕空间 FBO，缩放/平移自然适配
//   - 加法混合在 FBO 中累积，显示时带 Bloom

import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import type { SmellPoint } from '../data/mockSmells';
import { oklchToLinearRgb } from '../utils/oklch';
import {
  drawVert, drawFrag,
  advectVert, advectFrag,
  displayVert, displayFrag,
} from './shaders/shaders';

// ---- 常量 ----
const FBO_SCALE = 2; // FBO 分辨率 = 画布 / FBO_SCALE

// 六顶点 quad（两个三角形，覆盖 -1..1）
const QUAD_VERTS = new Float32Array([
  -1, -1,  1, -1, -1,  1,
   1, -1,  1,  1, -1,  1,
]);

const SMELL_CORNERS: [number, number][] = [
  [-1, -1], [ 1, -1], [-1,  1],
  [ 1, -1], [ 1,  1], [-1,  1],
];

// ---- 接口 ----
interface SmellLayerOptions {
  smells: SmellPoint[];
  windSpeed?: number;
  windDir?: [number, number];
}

// ---- 工具函数 ----
function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h) + id.charCodeAt(i);
    h |= 0;
  }
  return ((Math.abs(h) % 10000) / 10000);
}

function lngLatToMercator(lng: number, lat: number): [number, number] {
  const c = maplibregl.MercatorCoordinate.fromLngLat({ lng, lat });
  return [c.x, c.y];
}

interface FBOPair {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
}

interface ProgramInfo {
  program: WebGLProgram;
  attribs: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

// ================================================================
export class SmellLayer implements CustomLayerInterface {
  id = 'smell-layer';
  type = 'custom' as const;
  renderingMode = '2d' as const;

  // ---- WebGL 资源 ----
  private gl: WebGLRenderingContext | null = null;
  private drawProg: ProgramInfo | null = null;
  private advectProg: ProgramInfo | null = null;
  private displayProg: ProgramInfo | null = null;

  private readFBO: FBOPair | null = null;
  private writeFBO: FBOPair | null = null;
  private fboWidth = 512;
  private fboHeight = 512;

  private quadBuf: WebGLBuffer | null = null;
  private smellBuf: WebGLBuffer | null = null;

  // ---- 状态 ----
  private smellsRef: SmellPoint[];
  private smellsCount: number;
  private currentWindSpeed: number;
  private currentWindDir: [number, number];
  private canvasWidth = 1;
  private canvasHeight = 1;
  private map: MapLibreMap | null = null;
  private rafId = 0;
  private lastFrameTime = 0;
  private needsBufferRebuild = true;

  // 地图移动/缩放追踪（用于 FBO 清除）
  private lastZoom = 0;
  private lastMercX = 0;
  private lastMercY = 0;

  constructor(options: SmellLayerOptions) {
    this.smellsRef = options.smells;
    this.smellsCount = options.smells.length;
    this.currentWindSpeed = options.windSpeed ?? 0.45;
    this.currentWindDir = options.windDir ?? [1, 0];
  }

  // ---- Public API ----
  setSmells(smells: SmellPoint[]): void {
    this.smellsRef = smells;
    this.smellsCount = smells.length;
    this.needsBufferRebuild = true;
  }

  setWind(speed: number, dir: [number, number]): void {
    this.currentWindSpeed = speed;
    this.currentWindDir = dir;
  }

  // ---- CustomLayerInterface ----
  onAdd(map: MapLibreMap, gl: WebGLRenderingContext): void {
    console.log('[SmellLayer] onAdd, smells:', this.smellsCount);
    this.map = map;
    this.gl = gl;
    this.canvasWidth = gl.canvas.width;
    this.canvasHeight = gl.canvas.height;

    // 编译 shader
    this.drawProg = this.buildProgram(gl, drawVert, drawFrag, ['a_pos', 'a_corner', 'a_color', 'a_intensity', 'a_seed', 'a_phase'], ['u_matrix', 'u_canvasSize', 'u_metersPerPixel', 'u_zoom', 'u_time']);
    this.advectProg = this.buildProgram(gl, advectVert, advectFrag, ['a_pos'], ['u_concentration', 'u_resolution', 'u_time', 'u_windDir', 'u_windSpeed', 'u_deltaTime']);
    this.displayProg = this.buildProgram(gl, displayVert, displayFrag, ['a_pos'], ['u_concentration']);

    if (!this.drawProg || !this.advectProg || !this.displayProg) {
      console.error('[SmellLayer] Shader compilation failed');
      return;
    }

    // 创建 FBO
    this.createFBOs(gl);
    // 创建 quad buffer
    this.quadBuf = this.createBuffer(gl, QUAD_VERTS, gl.STATIC_DRAW);
    // 创建 smell buffer
    this.rebuildSmellBuffer(gl);

    // 监听 resize
    map.on('resize', this.onResize);

    // RAF 循环触发热重绘
    const tick = () => {
      if (!this.map) return;
      this.map.triggerRepaint();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(gl: WebGLRenderingContext, _matrix: any): void {
    if (!this.drawProg || !this.advectProg || !this.displayProg) return;
    if (!this.readFBO || !this.writeFBO) return;

    const matrix = _matrix as number[];

    // 帧时间
    const now = performance.now();
    const dt = this.lastFrameTime > 0 ? Math.min((now - this.lastFrameTime) / 1000, 0.1) : 0.016;
    this.lastFrameTime = now;

    // 确保 FBO 尺寸匹配
    this.ensureFBOSize(gl);

    // 重建 smell buffer（如有新数据）
    if (this.needsBufferRebuild) {
      this.rebuildSmellBuffer(gl);
      this.needsBufferRebuild = false;
    }

    // 检测地图移动/缩放：如果变化超过阈值，清除 FBO 累积历史
    // 因为 FBO 是屏幕空间，地图移动后旧数据位置不对
    if (this.shouldClearFBOs()) {
      this.clearFBOs(gl);
    }

    // ---- Pass 1: Advection ----
    this.runAdvectionPass(gl, dt);

    // ---- Pass 2: Draw Smells ----
    this.runDrawPass(gl, matrix);

    // ---- Swap FBOs ----
    this.swapFBOs();

    // ---- Pass 3: Display ----
    this.runDisplayPass(gl);
  }

  onRemove(_map: MapLibreMap, gl: WebGLRenderingContext): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.map = null;
    _map.off('resize', this.onResize);

    if (this.readFBO) {
      gl.deleteFramebuffer(this.readFBO.fb);
      gl.deleteTexture(this.readFBO.tex);
    }
    if (this.writeFBO) {
      gl.deleteFramebuffer(this.writeFBO.fb);
      gl.deleteTexture(this.writeFBO.tex);
    }
    if (this.quadBuf) gl.deleteBuffer(this.quadBuf);
    if (this.smellBuf) gl.deleteBuffer(this.smellBuf);
    if (this.drawProg) gl.deleteProgram(this.drawProg.program);
    if (this.advectProg) gl.deleteProgram(this.advectProg.program);
    if (this.displayProg) gl.deleteProgram(this.displayProg.program);

    this.gl = null;
  }

  // ============================================================
  // Private: Rendering Passes
  // ============================================================

  private runAdvectionPass(gl: WebGLRenderingContext, dt: number): void {
    const p = this.advectProg!;
    gl.useProgram(p.program);

    // 绑定 writeFBO 作为输出
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFBO!.fb);
    gl.viewport(0, 0, this.fboWidth, this.fboHeight);

    // 绑定 readFBO 纹理作为输入
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.readFBO!.tex);
    gl.uniform1i(p.uniforms['u_concentration'], 0);

    gl.uniform2f(p.uniforms['u_resolution'], this.fboWidth, this.fboHeight);
    gl.uniform1f(p.uniforms['u_time'], (performance.now() / 1000) % 1000);
    gl.uniform2f(p.uniforms['u_windDir'], this.currentWindDir[0], this.currentWindDir[1]);
    gl.uniform1f(p.uniforms['u_windSpeed'], this.currentWindSpeed);
    gl.uniform1f(p.uniforms['u_deltaTime'], dt);

    // 绑定 quad buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(p.attribs['a_pos']);
    gl.vertexAttribPointer(p.attribs['a_pos'], 2, gl.FLOAT, false, 0, 0);

    // 不加混合（直接覆盖写入）
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private runDrawPass(gl: WebGLRenderingContext, matrix: number[]): void {
    const p = this.drawProg!;
    gl.useProgram(p.program);

    // writeFBO 仍然是当前输出目标
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFBO!.fb);
    gl.viewport(0, 0, this.fboWidth, this.fboHeight);

    // 标准 alpha 混合：重叠的颜色自然融合，不会叠加变白
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    // Uniforms
    gl.uniformMatrix4fv(p.uniforms['u_matrix'], false, matrix);
    gl.uniform2f(p.uniforms['u_canvasSize'], this.canvasWidth, this.canvasHeight);
    gl.uniform1f(p.uniforms['u_time'], (performance.now() / 1000) % 1000);

    // metersPerPixel（用于世界尺寸→屏幕像素）
    const metersPerPixel = (40075016.686 * Math.cos(45.775 * Math.PI / 180)) /
                           (256 * Math.pow(2, this.getMapZoom()));
    gl.uniform1f(p.uniforms['u_metersPerPixel'], metersPerPixel);
    gl.uniform1f(p.uniforms['u_zoom'], this.getMapZoom());

    // 绑定 smell buffer
    if (!this.smellBuf || this.smellsCount === 0) {
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.smellBuf);
    const stride = 10 * 4; // 10 floats per vertex

    const bindAttr = (name: string, size: number, offset: number) => {
      const loc = p.attribs[name];
      if (loc !== undefined && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      }
    };
    bindAttr('a_pos', 2, 0);
    bindAttr('a_corner', 2, 2 * 4);
    bindAttr('a_color', 3, 4 * 4);
    bindAttr('a_intensity', 1, 7 * 4);
    bindAttr('a_seed', 1, 8 * 4);
    bindAttr('a_phase', 1, 9 * 4);

    gl.drawArrays(gl.TRIANGLES, 0, this.smellsCount * 6);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  private runDisplayPass(gl: WebGLRenderingContext): void {
    const p = this.displayProg!;
    gl.useProgram(p.program);

    // 输出到屏幕
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);

    // 绑定 readFBO 纹理
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.readFBO!.tex);
    gl.uniform1i(p.uniforms['u_concentration'], 0);

    // 标准 alpha 混合：FBO 纹理叠加到地图上
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 绑定 quad buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(p.attribs['a_pos']);
    gl.vertexAttribPointer(p.attribs['a_pos'], 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.disable(gl.BLEND);
  }

  // ============================================================
  // Private: Resource Management
  // ============================================================

  private createFBOs(gl: WebGLRenderingContext): void {
    this.fboWidth = Math.max(1, Math.floor(this.canvasWidth / FBO_SCALE));
    this.fboHeight = Math.max(1, Math.floor(this.canvasHeight / FBO_SCALE));

    this.readFBO = this.createFBOPair(gl, this.fboWidth, this.fboHeight);
    this.writeFBO = this.createFBOPair(gl, this.fboWidth, this.fboHeight);
  }

  private createFBOPair(gl: WebGLRenderingContext, w: number, h: number): FBOPair {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    return { fb, tex };
  }

  private ensureFBOSize(gl: WebGLRenderingContext): void {
    const newW = Math.max(1, Math.floor(this.canvasWidth / FBO_SCALE));
    const newH = Math.max(1, Math.floor(this.canvasHeight / FBO_SCALE));
    if (newW === this.fboWidth && newH === this.fboHeight) return;

    console.log('[SmellLayer] Resize FBO:', newW, 'x', newH);
    // 删除旧 FBO
    if (this.readFBO) {
      gl.deleteFramebuffer(this.readFBO.fb);
      gl.deleteTexture(this.readFBO.tex);
    }
    if (this.writeFBO) {
      gl.deleteFramebuffer(this.writeFBO.fb);
      gl.deleteTexture(this.writeFBO.tex);
    }

    this.fboWidth = newW;
    this.fboHeight = newH;
    this.readFBO = this.createFBOPair(gl, newW, newH);
    this.writeFBO = this.createFBOPair(gl, newW, newH);
  }

  private createBuffer(gl: WebGLRenderingContext, data: Float32Array, usage: number): WebGLBuffer {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    return buf;
  }

  private rebuildSmellBuffer(gl: WebGLRenderingContext): void {
    const data: number[] = [];
    for (const s of this.smellsRef) {
      const seed = hashSeed(s.id);
      const [r, g, b] = this.oklchToRgb01Boosted(s.oklch.L, s.oklch.C, s.oklch.H);
      const [mx, my] = lngLatToMercator(s.position[0], s.position[1]);

      for (const [cx, cy] of SMELL_CORNERS) {
        data.push(
          mx, my,      // mercator pos
          cx, cy,      // quad corner
          r, g, b,     // RGB (0-1)
          s.intensity, // intensity
          seed,        // per-smell seed
          s.phase,     // phase
        );
      }
    }

    if (this.smellBuf) gl.deleteBuffer(this.smellBuf);
    this.smellBuf = this.createBuffer(gl, new Float32Array(data), gl.DYNAMIC_DRAW);
  }

  private swapFBOs(): void {
    const tmp = this.readFBO;
    this.readFBO = this.writeFBO;
    this.writeFBO = tmp;
  }

  /**
   * 检测地图是否发生了显著移动或缩放。
   * 屏幕空间 FBO 的旧数据在地图移动后位置不对，需要清除。
   */
  private shouldClearFBOs(): boolean {
    if (!this.map) return false;
    const zoom = this.map.getZoom();
    const center = this.map.getCenter();
    const merc = maplibregl.MercatorCoordinate.fromLngLat(center);

    // 第一次运行，记录初始位置
    if (this.lastZoom === 0 && this.lastMercX === 0) {
      this.lastZoom = zoom;
      this.lastMercX = merc.x;
      this.lastMercY = merc.y;
      return false;
    }

    // 缩放变化 > 0.1 或 mercator 空间位移 > 0.00005（约 2 像素在 zoom 12.5）
    const zoomChanged = Math.abs(zoom - this.lastZoom) > 0.1;
    const dx = Math.abs(merc.x - this.lastMercX);
    const dy = Math.abs(merc.y - this.lastMercY);
    const moved = dx > 0.00003 || dy > 0.00003;

    if (zoomChanged || moved) {
      this.lastZoom = zoom;
      this.lastMercX = merc.x;
      this.lastMercY = merc.y;
      return true;
    }
    return false;
  }

  /**
   * 清除两个 FBO（填充透明黑色）
   */
  private clearFBOs(gl: WebGLRenderingContext): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFBO!.fb);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFBO!.fb);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private getMapZoom(): number {
    return this.map?.getZoom() ?? 12.5;
  }

  private onResize = (): void => {
    if (!this.gl || !this.map) return;
    this.canvasWidth = this.gl.canvas.width;
    this.canvasHeight = this.gl.canvas.height;
  };

  // ============================================================
  // Private: Shader Compilation
  // ============================================================

  private buildProgram(
    gl: WebGLRenderingContext,
    vertSrc: string,
    fragSrc: string,
    attribNames: string[],
    uniformNames: string[],
  ): ProgramInfo | null {
    const vert = this.compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const frag = this.compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[SmellLayer] Link error:', gl.getProgramInfoLog(program));
      return null;
    }

    // 收集 attribute locations
    const attribs: Record<string, number> = {};
    for (const name of attribNames) {
      attribs[name] = gl.getAttribLocation(program, name);
    }

    // 收集 uniform locations
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }

    return { program, attribs, uniforms };
  }

  private compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[SmellLayer] Shader error:', gl.getShaderInfoLog(shader));
      console.error('[SmellLayer] Source:', source.substring(0, 200));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  // ============================================================
  // Private: Color Conversion
  // ============================================================

  /**
   * OKLCH → 0-1 sRGB（略微提亮用于加法混合）
   */
  private oklchToRgb01Boosted(L: number, C: number, H: number): [number, number, number] {
    const [rl, gl, bl] = oklchToLinearRgb(L, C, H);
    // sRGB gamma（不做任何提亮，保持颜色纯净）
    const toSrgb = (c: number) => {
      c = Math.max(0, Math.min(1, c));
      return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    };
    return [
      Math.max(0, Math.min(1, toSrgb(rl))),
      Math.max(0, Math.min(1, toSrgb(gl))),
      Math.max(0, Math.min(1, toSrgb(bl))),
    ];
  }
}