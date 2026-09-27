import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { sampleLevels } from "../state/levels";
import { SPIN, SPIN_REV, ms } from "./motion";

/**
 * Ryu's presence (web). A WebGL energy core — fbm plasma inside a fresnel
 * shell with a soft halo — driven by *real* audio levels, plus crisp SVG
 * rings. Colour morphs between System blue and Shadow violet.
 */
export type CoreMode = "idle" | "listening" | "speaking" | "thinking" | "recording" | "dormant" | "offline";

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uLevel; uniform vec3 uA; uniform vec3 uB; uniform float uDim; uniform float uThink;
float h(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h(i+vec3(0,0,0)),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes) / min(uRes.x, uRes.y);
  float r = length(uv);
  float lv = uLevel;
  float R = .23 + .035*lv + .006*sin(uTime*1.7);
  float t = uTime*(.22 + .5*uThink);
  vec3 col = vec3(0.); float a = 0.;
  if (r < R) {
    float d = r/R; float z = sqrt(1.-d*d);
    vec3 p = vec3(uv/R, z);
    float q = fbm(p*2.1 + vec3(0., t, t*.6));
    float w = fbm(p*3.7 + vec3(t*1.4, -t*.8, q*2.));
    float fres = pow(1.-z, 2.4);
    float core = pow(z, 7.)*(.55 + 1.1*lv);
    vec3 plasma = mix(uA, uB, smoothstep(.25,.85,w));
    float e = pow(clamp(w*q*1.75, 0., 1.), 1.7);
    float fil = smoothstep(.56, .6, fbm(p*5.5 + vec3(-t*1.8, t, 0.))) * (.35 + .5*lv);
    col = plasma*(.1 + 1.9*e) + mix(uA,vec3(1.),.45)*fres*1.7 + vec3(.85,.93,1.)*(core*.95 + fil*.6);
    col *= .75 + .6*lv;
    a = 1.;
  }
  float edge = max(r - R, 0.);
  float halo = exp(-edge*(9.5 - 3.5*lv)) * (.42 + .7*lv);
  float ring = exp(-pow((r - R*1.02)*95., 2.)) * .55;
  col += uA*halo*.9 + mix(uA, vec3(1.), .5)*ring;
  a = max(a, clamp(halo*.95 + ring, 0., 1.));
  col *= uDim; a *= uDim;
  gl_FragColor = vec4(col*a, a);
}`;

const MODE_COLORS: Record<CoreMode, [number[], number[], number]> = {
  idle: [[0.2, 0.55, 1.0], [0.55, 0.85, 1.0], 0.85],
  listening: [[0.2, 0.58, 1.0], [0.62, 0.9, 1.0], 1.0],
  speaking: [[0.35, 0.7, 1.0], [0.85, 0.96, 1.0], 1.0],
  thinking: [[0.3, 0.5, 1.0], [0.62, 0.45, 1.0], 1.0],
  recording: [[0.5, 0.3, 1.0], [0.82, 0.6, 1.0], 1.0],
  dormant: [[0.12, 0.3, 0.65], [0.3, 0.5, 0.8], 0.45],
  offline: [[0.25, 0.32, 0.45], [0.45, 0.52, 0.65], 0.5],
};

export function Core({ size, mode }: { size: number; mode: CoreMode }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = U("uRes"), uTime = U("uTime"), uLevel = U("uLevel"), uA = U("uA"), uB = U("uB"), uDim = U("uDim"), uThink = U("uThink");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Smoothed state: colours and level ease toward targets every frame.
    const cur = { a: [...MODE_COLORS.idle[0]], b: [...MODE_COLORS.idle[1]], dim: 0.85, lv: 0, think: 0 };
    let raf = 0;
    const t0 = performance.now();
    const frame = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      const m = modeRef.current;
      const [ta, tb, tdim] = MODE_COLORS[m];
      const k = 0.06;
      for (let i = 0; i < 3; i++) {
        cur.a[i] += (ta[i] - cur.a[i]) * k;
        cur.b[i] += (tb[i] - cur.b[i]) * k;
      }
      cur.dim += (tdim - cur.dim) * k;
      cur.think += ((m === "thinking" ? 1 : 0) - cur.think) * 0.05;
      const { input, output } = sampleLevels();
      const target = m === "speaking" ? output : m === "dormant" || m === "offline" ? 0 : Math.max(input * 0.8, output);
      cur.lv += (target - cur.lv) * (target > cur.lv ? 0.35 : 0.08); // fast attack, slow release
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, (performance.now() - t0) / 1000);
      gl.uniform1f(uLevel, cur.lv);
      gl.uniform3f(uA, cur.a[0], cur.a[1], cur.a[2]);
      gl.uniform3f(uB, cur.b[0], cur.b[1], cur.b[2]);
      gl.uniform1f(uDim, cur.dim);
      gl.uniform1f(uThink, cur.think);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tint = mode === "recording" ? "rgba(187,164,255," : "rgba(140,203,255,";
  const slow = mode === "thinking" ? 5000 : 26000;
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" } as never} />
      <Rings size={size} tint={tint} slow={slow} dim={mode === "dormant" || mode === "offline"} />
    </View>
  );
}

function Rings({ size, tint, slow, dim }: { size: number; tint: string; slow: number; dim: boolean }) {
  const o = dim ? 0.35 : 1;
  const ring = (scale: number, dur: number, rev: boolean, stroke: string, dash: string, width = 1) => (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { transform: [{ scale }], animationName: rev ? SPIN_REV : SPIN, animationDuration: ms(dur), animationIterationCount: "infinite", animationTimingFunction: "linear" },
      ]}
    >
      <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ overflow: "visible", opacity: o, transition: "opacity .8s" } as never}>
        <circle cx="100" cy="100" r="96" fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={dash} />
      </svg>
    </Animated.View>
  );
  return (
    <>
      {ring(1, slow * 1.6, false, `${tint}0.28)`, "1 5")}
      {ring(0.86, slow, true, `${tint}0.55)`, "70 18 6 18", 1.2)}
      {ring(0.74, slow * 0.45, false, `${tint}0.85)`, "26 300", 2)}
      {ring(0.64, slow * 0.8, true, `${tint}0.22)`, "2 7")}
      <Ticks tint={tint} o={o} />
    </>
  );
}

function Ticks({ tint, o }: { tint: string; o: number }) {
  const lines = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    const r1 = 90, r2 = i % 5 ? 92.5 : 95.5;
    return <line key={i} x1={100 + Math.cos(a) * r1} y1={100 + Math.sin(a) * r1} x2={100 + Math.cos(a) * r2} y2={100 + Math.sin(a) * r2} stroke={`${tint}${i % 5 ? 0.3 : 0.6})`} strokeWidth={0.7} />;
  });
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", opacity: o, transform: "scale(0.93)" } as never}>
      {lines}
    </svg>
  );
}
