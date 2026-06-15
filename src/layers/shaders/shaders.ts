// 气味地图 · 浓度场渲染管线 Shader
// 三组：draw（气味注入）→ advect（流场 warp）→ display（屏幕输出）
// 核心：FBO ping-pong + Curl Noise 流场

// ============================================================
// 1. 气味注入 Shader（Draw Smells）
// ============================================================

export const drawVert = /* glsl */ `
precision highp float;

attribute vec2 a_pos;        // mercator (0..1)
attribute vec2 a_corner;     // quad corner (-1..1)
attribute vec3 a_color;      // RGB (0-1), 已从 OKLCH 转换
attribute float a_intensity; // 0-1
attribute float a_seed;      // 气味种子
attribute float a_phase;     // 呼吸相位

uniform mat4 u_matrix;
uniform vec2 u_canvasSize;   // 地图画布像素尺寸
uniform float u_metersPerPixel;
uniform float u_zoom;
uniform float u_time;

varying vec2 v_uv;
varying vec3 v_color;
varying float v_intensity;
varying float v_seed;
varying float v_phase;

void main() {
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
  vec2 clipCenter = gl_Position.xy / gl_Position.w;

  float breath = 1.0 + 0.08 * sin(u_time * 0.35 + a_phase);

  float worldRadiusM = 350.0 * a_intensity + 150.0;
  float pixelRadius = (worldRadiusM / u_metersPerPixel) * breath;

  float zoomFactor = 1.0;
  if (u_zoom > 14.0) {
    zoomFactor = 1.0 + (u_zoom - 14.0) * 0.4;
  } else if (u_zoom < 11.0) {
    zoomFactor = 0.6 + (u_zoom - 9.0) * 0.2;
  }
  pixelRadius *= zoomFactor;
  pixelRadius = clamp(pixelRadius, 30.0, 350.0);

  vec2 clipOffset = (a_corner * pixelRadius * 2.0) / u_canvasSize;
  gl_Position = vec4((clipCenter + clipOffset) * gl_Position.w, gl_Position.z, gl_Position.w);

  v_uv = a_corner;
  v_color = a_color;
  v_intensity = a_intensity;
  v_seed = a_seed;
  v_phase = a_phase;
}
`;

export const drawFrag = /* glsl */ `
precision highp float;

varying vec2 v_uv;
varying vec3 v_color;
varying float v_intensity;
varying float v_seed;
varying float v_phase;

uniform float u_time;

// Simplex 2D noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
       + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = v_uv;
  float dist = length(uv);
  if (dist > 1.0) discard;

  // 多层柔和渐变（像水彩晕染，无聚光亮点）
  float inner = 1.0 - smoothstep(0.0, 0.55, dist);
  inner = pow(inner, 3.0) * 0.55;

  float midNoise = snoise(uv * 2.0 + v_seed * 10.0 + u_time * 0.03);
  float mid = 1.0 - smoothstep(0.2, 0.7, dist);
  mid = mid * (0.65 + 0.35 * midNoise);
  mid = pow(mid, 1.5) * 0.30;

  float outerNoise1 = snoise(uv * 1.5 + v_seed * 15.0 + u_time * 0.04);
  float outerNoise2 = snoise(uv * 2.5 - v_seed * 8.0 + u_time * 0.025);
  float edgeDistort = outerNoise1 * 0.12 + outerNoise2 * 0.06;
  float rDistorted = dist - edgeDistort;
  float outer = 1.0 - smoothstep(0.25, 1.0, rDistorted);
  outer = max(0.0, outer) * 0.20;

  float traceNoise = snoise(uv * 0.8 + v_seed * 20.0 - u_time * 0.02);
  float rTrace = dist - traceNoise * 0.04;
  float trace = 1.0 - smoothstep(0.4, 1.05, rTrace);
  trace = max(0.0, trace) * 0.10;

  float alpha = inner + mid + outer + trace;
  alpha *= v_intensity * 0.65;

  // 纯色输出，不做任何提亮
  gl_FragColor = vec4(v_color, alpha);
}
`;

// ============================================================
// 2. 流场 Advection Shader
// ============================================================

export const advectVert = /* glsl */ `
precision highp float;

attribute vec2 a_pos;

varying vec2 v_uv;

void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_pos * 0.5 + 0.5;
}
`;

export const advectFrag = /* glsl */ `
precision highp float;

varying vec2 v_uv;

uniform sampler2D u_concentration;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_windDir;
uniform float u_windSpeed;
uniform float u_deltaTime;

// Simplex 2D
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
       + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec2 curlNoise(vec2 p, float t) {
  float eps = 0.005;
  float psi_center = snoise(p + t * 0.006);
  float psi_dx = snoise(p + vec2(eps, 0.0) + t * 0.006);
  float psi_dy = snoise(p + vec2(0.0, eps) + t * 0.006);
  float dpsi_dx = (psi_dx - psi_center) / eps;
  float dpsi_dy = (psi_dy - psi_center) / eps;
  return vec2(dpsi_dy, -dpsi_dx);
}

void main() {
  vec2 curlSmall = curlNoise(v_uv * 8.0, u_time);
  vec2 curlMedium = curlNoise(v_uv * 3.0 + 100.0, u_time * 0.3);
  vec2 curlLarge = curlNoise(v_uv * 1.5 + 50.0, u_time * 0.15);

  vec2 curlVec = curlSmall * 0.15 + curlMedium * 0.1 + curlLarge * 0.05;

  float windPixels = u_windSpeed * 0.8;
  vec2 windVec = u_windDir * windPixels;

  vec2 totalOffset = curlVec * 0.8 + windVec;
  vec2 offsetUV = totalOffset / u_resolution;
  vec2 sampleUV = v_uv - offsetUV;

  vec2 d = 0.4 / u_resolution;
  vec4 c00 = texture2D(u_concentration, sampleUV);
  vec4 c10 = texture2D(u_concentration, sampleUV + vec2(d.x, 0.0));
  vec4 c01 = texture2D(u_concentration, sampleUV + vec2(0.0, d.y));
  vec4 cm10 = texture2D(u_concentration, sampleUV - vec2(d.x, 0.0));
  vec4 cm01 = texture2D(u_concentration, sampleUV - vec2(0.0, d.y));

  vec4 diffused = c00 * 0.6 + (c10 + c01 + cm10 + cm01) * 0.1;

  float decay = exp(-0.45 * u_deltaTime);

  gl_FragColor = diffused * decay;
}
`;

// ============================================================
// 3. 显示 Shader（Display）
//    纯色输出，不做 Bloom（气味不发光）
// ============================================================

export const displayVert = /* glsl */ `
precision highp float;

attribute vec2 a_pos;

varying vec2 v_uv;

void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_pos * 0.5 + 0.5;
}
`;

export const displayFrag = /* glsl */ `
precision highp float;

varying vec2 v_uv;

uniform sampler2D u_concentration;

void main() {
  // 纯色输出，不做 Bloom、不做对比度增强
  // 气味是透明的颜料，不是发光体
  gl_FragColor = texture2D(u_concentration, v_uv);
}
`;