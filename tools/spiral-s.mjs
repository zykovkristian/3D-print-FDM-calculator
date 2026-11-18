// Схема двойной спирали MVS: архимедова спираль внутрь -> S-переход через
// центр (кубический Безье) -> спираль наружу.
//
// Формулы задания (как в ТЗ):
//   R, rc, N, d = R-rc, w = 2*pi*N, L
//   C1(t) = ((R-d*t)cos(w*t), (R-d*t)sin(w*t))
//   S(t)  = кубический Безье P0..P3, P0 = rc*u(w), P3 = rc*u(w+pi),
//           касательные: A = C1'(1), B = C2'(0), ручки длиной L
//   C2(t) = ((rc+d*t)cos(w+pi+w*t), (rc+d*t)sin(w+pi+w*t))
//
// Скрипт рисует SVG (статичную картинку) и HTML (та же модель с ползунками),
// печатает проверки: самопересечения, минимальный зазор, радиус кривизны.

import { writeFileSync } from 'node:fs';

const TAU = Math.PI * 2;
const P = { R: 18, rc: 2.5, N: 6.5, L: 2.5 };
P.d = P.R - P.rc;
P.w = TAU * P.N;

// --- части траектории ---
// mode 'spec' — как в ТЗ: выходящая ветвь крутится в ту же сторону, что и
// входящая (угол растёт). mode 'fixed' — выходящая ветвь крутится в
// противоположную сторону: тогда обе ветви параллельны (каналы чередуются),
// и точка пересечения исчезает.
function part1(P, n = 1400) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = P.R - P.d * t, a = P.w * t;
    out.push({ x: r * Math.cos(a), y: r * Math.sin(a), part: 'in' });
  }
  return out;
}
function part3(P, n = 1400, mode = 'spec') {
  const out = [];
  const sgn = mode === 'fixed' ? -1 : 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = P.rc + P.d * t, a = P.w + Math.PI + sgn * P.w * t;
    out.push({ x: r * Math.cos(a), y: r * Math.sin(a), part: 'out' });
  }
  return out;
}
function sCurve(P, n = 400, mode = 'spec') {
  const w = P.w, rc = P.rc;
  const P0x = rc * Math.cos(w), P0y = rc * Math.sin(w);
  const P3x = rc * Math.cos(w + Math.PI), P3y = rc * Math.sin(w + Math.PI);
  // входящая касательная: d/dt C1 в t=1
  const Ax = -P.d * Math.cos(w) - rc * w * Math.sin(w);
  const Ay = -P.d * Math.sin(w) + rc * w * Math.cos(w);
  // исходящая касательная: d/dt C2 в t=0
  // (для mode 'fixed' угол убывает: a(t) = w+pi-w*t, поэтому знак меняется
  //  только у члена с производной синуса)
  const sgn = mode === 'fixed' ? -1 : 1;
  const Bx = sgn * P.d * Math.cos(w + Math.PI) - sgn * rc * w * Math.sin(w + Math.PI);
  const By = P.d * Math.sin(w + Math.PI) + rc * w * Math.cos(w + Math.PI);
  const An = Math.hypot(Ax, Ay), Bn = Math.hypot(Bx, By);
  const Ux = Ax / An, Uy = Ay / An, Vx = Bx / Bn, Vy = By / Bn;
  const P1x = P0x + P.L * Ux, P1y = P0y + P.L * Uy;
  const P2x = P3x - P.L * Vx, P2y = P3y - P.L * Vy;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, mt = 1 - t;
    out.push({
      x: mt * mt * mt * P0x + 3 * mt * mt * t * P1x + 3 * mt * t * t * P2x + t * t * t * P3x,
      y: mt * mt * mt * P0y + 3 * mt * mt * t * P1y + 3 * mt * t * t * P2y + t * t * t * P3y,
      part: 's'
    });
  }
  return { pts: out, ctrl: { P0: [P0x, P0y], P1: [P1x, P1y], P2: [P2x, P2y], P3: [P3x, P3y] } };
}

// --- метрики ---
function curvature(pts, i) {
  if (i <= 0 || i >= pts.length - 1) return Infinity;
  const a = pts[i - 1], b = pts[i], c = pts[i + 1];
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  if (ab < 1e-12 || bc < 1e-12 || ca < 1e-12) return Infinity;
  const s = (ab + bc + ca) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ca)));
  if (area < 1e-12) return Infinity;
  return ab * bc * ca / (4 * area);
}
function distToSeg(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
  if (L2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}
function metrics(path) {
  let Rmin = Infinity, RminAt = -1;
  for (let i = 1; i < path.length - 1; i++) {
    const R = curvature(path, i);
    if (R < Rmin) { Rmin = R; RminAt = i; }
  }
  let maxTurn = 0, turnAt = -1;
  for (let i = 1; i < path.length - 1; i++) {
    const v1 = [path[i].x - path[i - 1].x, path[i].y - path[i - 1].y];
    const v2 = [path[i + 1].x - path[i].x, path[i + 1].y - path[i].y];
    const n1 = Math.hypot(...v1), n2 = Math.hypot(...v2);
    if (n1 < 1e-9 || n2 < 1e-9) continue;
    const c = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)));
    const deg = Math.acos(c) * 180 / Math.PI;
    if (deg > maxTurn) { maxTurn = deg; turnAt = i; }
  }
  // минимальный зазор между несмежными участками (точка -> отрезок)
  const cell = 0.25, grid = new Map();
  for (let i = 0; i < path.length; i++) {
    const k = Math.floor(path[i].x / cell) + ',' + Math.floor(path[i].y / cell);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  let minGap = Infinity, gapAt = -1;
  for (const bucket of grid.values()) {
    for (const i of bucket) {
      const ix = Math.floor(path[i].x / cell), iy = Math.floor(path[i].y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const other = grid.get((ix + dx) + ',' + (iy + dy));
        if (!other) continue;
        for (const j of other) {
          if (j <= i + 4 || j === 0 || i === 0) continue;
          const d = Math.min(distToSeg(path[i], path[j - 1], path[j]), distToSeg(path[j], path[i - 1], path[i]));
          if (d < minGap) { minGap = d; gapAt = i; }
        }
      }
    }
  }
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  const rMinOrigin = Math.min(...path.map(q => Math.hypot(q.x, q.y)));
  return { Rmin, RminAt, maxTurn, turnAt, minGap, gapAt, len, rMinOrigin };
}

// --- сборка траектории ---
function build(P, mode = 'spec') {
  const a = part1(P), s = sCurve(P, 400, mode), b = part3(P, 1400, mode);
  const path = [...a, ...s.pts.slice(1, -1), ...b.slice(1)];
  return { path, ctrl: s.ctrl, parts: { in: a, s: s.pts, out: b } };
}

// --- SVG ---
function svg(P, M) {
  const { path, ctrl, parts } = M;
  const pad = 3;
  const size = 2 * (P.R + pad);
  const S = 620;
  const X = (x) => (S / 2 + x * (S / size)).toFixed(2);
  const Y = (y) => (S / 2 - y * (S / size)).toFixed(2);
  const col = { in: '#4d8dff', s: '#f2a03c', out: '#33c6bd' };
  const pathOf = (arr) => arr.map((q, i) => `${i ? 'L' : 'M'} ${X(q.x)} ${Y(q.y)}`).join(' ');
  let g = '';
  g += `<rect width="${S}" height="${S + 40}" fill="#0e1218"/>`;
  g += `<circle cx="${S / 2}" cy="${S / 2}" r="${(P.R * (S / size)).toFixed(2)}" fill="none" stroke="#26303d" stroke-dasharray="4 4"/>`;
  g += `<circle cx="${S / 2}" cy="${S / 2}" r="${(P.rc * (S / size)).toFixed(2)}" fill="none" stroke="#26303d" stroke-dasharray="2 3"/>`;
  for (const k of ['in', 's', 'out']) {
    g += `<path d="${pathOf(parts[k])}" fill="none" stroke="${col[k]}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  // управляющие точки и касательные S-кривой
  const c = [['P0', ctrl.P0], ['P1', ctrl.P1], ['P2', ctrl.P2], ['P3', ctrl.P3]];
  g += `<path d="M ${X(ctrl.P0[0])} ${Y(ctrl.P0[1])} L ${X(ctrl.P1[0])} ${Y(ctrl.P1[1])} L ${X(ctrl.P2[0])} ${Y(ctrl.P2[1])} L ${X(ctrl.P3[0])} ${Y(ctrl.P3[1])}" fill="none" stroke="#ff5fa2" stroke-width="1" stroke-dasharray="4 3"/>`;
  for (const [nm, p] of c) {
    g += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3" fill="#ff5fa2"/><text x="${(+X(p[0]) + 6).toFixed(1)}" y="${(+Y(p[1]) - 5).toFixed(1)}" fill="#ff9ec4" font-size="10" font-family="monospace">${nm}</text>`;
  }
  // касательные в точках стыка
  const tang = (from, to) => `<path d="M ${X(from[0])} ${Y(from[1])} L ${X(to[0])} ${Y(to[1])}" stroke="#ffffff" stroke-width="1" opacity="0.8"/>`;
  const dirA = [ctrl.P1[0] - ctrl.P0[0], ctrl.P1[1] - ctrl.P0[1]];
  const dirB = [ctrl.P2[0] - ctrl.P3[0], ctrl.P2[1] - ctrl.P3[1]];
  g += tang(ctrl.P0, [ctrl.P0[0] + dirA[0] * 0.9, ctrl.P0[1] + dirA[1] * 0.9]);
  g += tang(ctrl.P3, [ctrl.P3[0] + dirB[0] * 0.9, ctrl.P3[1] + dirB[1] * 0.9]);
  const st = M.stats;
  g += `<text x="14" y="${S + 22}" fill="#9fb0c0" font-size="12" font-family="monospace">R=${P.R} rc=${P.rc} N=${P.N} L=${P.L} | R_кривизны=${st.Rmin.toFixed(2)} мм | излом=${st.maxTurn.toFixed(1)}° | мин. зазор=${st.minGap.toFixed(2)} мм | ближе к центру=${st.rMinOrigin.toFixed(2)} мм</text>`;
  g += `<text x="14" y="${S + 38}" fill="#6f8090" font-size="11" font-family="monospace">синий — внутрь, оранжевый — S-переход через центр, бирюзовый — наружу</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S + 40}" viewBox="0 0 ${S} ${S + 40}" font-family="monospace">${g}</svg>`;
}

// --- интерактивный HTML с ползунками ---
function html(P) {
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Двойная спираль MVS — S-переход</title>
<style>
body{margin:0;background:#0e1218;color:#e6edf3;font:14px system-ui,sans-serif}
.wrap{display:flex;gap:18px;padding:18px;flex-wrap:wrap}
.card{background:#121821;border:1px solid #26303d;border-radius:10px;padding:14px}
h2{font-size:15px;margin:0 0 10px}
label{display:block;margin:8px 0 2px;color:#9fb0c0;font-size:12px}
input[type=range]{width:220px}
svg{display:block;background:#0e1218;border-radius:8px}
#info{font-family:ui-monospace,monospace;font-size:12px;line-height:1.7;color:#9fb0c0}
b{color:#e6edf3}
</style>
<div class="wrap">
<div class="card">
<h2>Параметры</h2>
<label>R, мм: <span id="vR"></span></label><input id="R" type="range" min="8" max="24" step="0.5" value="${P.R}">
<label>r_c, мм: <span id="vrc"></span></label><input id="rc" type="range" min="0.6" max="8" step="0.1" value="${P.rc}">
<label>N, витков: <span id="vN"></span></label><input id="N" type="range" min="2" max="10" step="0.1" value="${P.N}">
<label>L, мм: <span id="vL"></span></label><input id="L" type="range" min="0.5" max="12" step="0.1" value="${P.L}">
<div id="info"></div>
</div>
<div class="card"><div id="pic"></div></div>
</div>
<script>
const TAU = Math.PI*2;
function part1(P,n){const o=[];for(let i=0;i<=n;i++){const t=i/n,r=P.R-P.d*t,a=P.w*t;o.push({x:r*Math.cos(a),y:r*Math.sin(a)});}return o;}
function part3(P,n){const o=[];for(let i=0;i<=n;i++){const t=i/n,r=P.rc+P.d*t,a=P.w+Math.PI+P.w*t;o.push({x:r*Math.cos(a),y:r*Math.sin(a)});}return o;}
function sCurve(P,n){const w=P.w,rc=P.rc;
 const P0x=rc*Math.cos(w),P0y=rc*Math.sin(w),P3x=rc*Math.cos(w+Math.PI),P3y=rc*Math.sin(w+Math.PI);
 const Ax=-P.d*Math.cos(w)-rc*w*Math.sin(w),Ay=-P.d*Math.sin(w)+rc*w*Math.cos(w);
 const Bx=P.d*Math.cos(w+Math.PI)-rc*w*Math.sin(w+Math.PI),By=P.d*Math.sin(w+Math.PI)+rc*w*Math.cos(w+Math.PI);
 const An=Math.hypot(Ax,Ay),Bn=Math.hypot(Bx,By);
 const P1x=P0x+P.L*Ax/An,P1y=P0y+P.L*Ay/An,P2x=P3x-P.L*Bx/Bn,P2y=P3y-P.L*By/Bn;
 const o=[];for(let i=0;i<=n;i++){const t=i/n,mt=1-t;
  o.push({x:mt*mt*mt*P0x+3*mt*mt*t*P1x+3*mt*t*t*P2x+t*t*t*P3x,
          y:mt*mt*mt*P0y+3*mt*mt*t*P1y+3*mt*t*t*P2y+t*t*t*P3y});}
 return {pts:o,ctrl:{P0:[P0x,P0y],P1:[P1x,P1y],P2:[P2x,P2y],P3:[P3x,P3y]}};}
function curv(p,i){if(i<=0||i>=p.length-1)return Infinity;const a=p[i-1],b=p[i],c=p[i+1];
 const ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),ca=Math.hypot(a.x-c.x,a.y-c.y);
 if(ab<1e-12||bc<1e-12||ca<1e-12)return Infinity;const s=(ab+bc+ca)/2;
 const ar=Math.sqrt(Math.max(0,s*(s-ab)*(s-bc)*(s-ca)));if(ar<1e-12)return Infinity;return ab*bc*ca/(4*ar);}
function dSeg(p,a,b){const vx=b.x-a.x,vy=b.y-a.y,L2=vx*vx+vy*vy;if(L2<1e-12)return Math.hypot(p.x-a.x,p.y-a.y);
 let t=((p.x-a.x)*vx+(p.y-a.y)*vy)/L2;t=Math.max(0,Math.min(1,t));return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy));}
function metrics(path){let Rmin=Infinity;for(let i=1;i<path.length-1;i++){const R=curv(path,i);if(R<Rmin)Rmin=R;}
 let mt=0;for(let i=1;i<path.length-1;i++){const v1=[path[i].x-path[i-1].x,path[i].y-path[i-1].y],v2=[path[i+1].x-path[i].x,path[i+1].y-path[i].y];
  const n1=Math.hypot(...v1),n2=Math.hypot(...v2);if(n1<1e-9||n2<1e-9)continue;
  const c=Math.max(-1,Math.min(1,(v1[0]*v2[0]+v1[1]*v2[1])/(n1*n2)));const d=Math.acos(c)*180/Math.PI;if(d>mt)mt=d;}
 const cell=0.25,grid=new Map();
 for(let i=0;i<path.length;i++){const k=Math.floor(path[i].x/cell)+','+Math.floor(path[i].y/cell);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}
 let gap=Infinity;
 for(const b of grid.values())for(const i of b){const ix=Math.floor(path[i].x/cell),iy=Math.floor(path[i].y/cell);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const o=grid.get((ix+dx)+','+(iy+dy));if(!o)continue;
   for(const j of o){if(j<=i+4||j===0||i===0)continue;const d=Math.min(dSeg(path[i],path[j-1],path[j]),dSeg(path[j],path[i-1],path[i]));if(d<gap)gap=d;}}}
 let len=0;for(let i=1;i<path.length;i++)len+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);
 const ro=Math.min(...path.map(q=>Math.hypot(q.x,q.y)));
 return {Rmin,maxTurn:mt,minGap:gap,len,rMinOrigin:ro};}
function render(){const P={R:+R.value,rc:+rc.value,N:+N.value,L:+L.value};P.d=P.R-P.rc;P.w=TAU*P.N;
 vR.textContent=P.R;vrc.textContent=P.rc;vN.textContent=P.N;vL.textContent=P.L;
 const a=part1(P,1200),s=sCurve(P,400),b=part3(P,1200);
 const path=[...a,...s.pts.slice(1,-1),...b.slice(1)];
 const st=metrics(path);
 const S=620,pad=3,size=2*(P.R+pad);
 const X=x=>(S/2+x*(S/size)).toFixed(2),Y=y=>(S/2-y*(S/size)).toFixed(2);
 const pathOf=arr=>arr.map((q,i)=>(i?'L':'M')+' '+X(q.x)+' '+Y(q.y)).join(' ');
 const col={in:'#4d8dff',s:'#f2a03c',out:'#33c6bd'};
 let g='<circle cx="'+S/2+'" cy="'+S/2+'" r="'+(P.R*(S/size)).toFixed(2)+'" fill="none" stroke="#26303d" stroke-dasharray="4 4"/>';
 g+='<circle cx="'+S/2+'" cy="'+S/2+'" r="'+(P.rc*(S/size)).toFixed(2)+'" fill="none" stroke="#26303d" stroke-dasharray="2 3"/>';
 for(const k of ['in','s','out'])g+='<path d="'+pathOf(k==='in'?a:k==='s'?s.pts:b)+'" fill="none" stroke="'+col[k]+'" stroke-width="2" stroke-linejoin="round"/>';
 const c=s.ctrl;
 g+='<path d="M '+X(c.P0[0])+' '+Y(c.P0[1])+' L '+X(c.P1[0])+' '+Y(c.P1[1])+' L '+X(c.P2[0])+' '+Y(c.P2[1])+' L '+X(c.P3[0])+' '+Y(c.P3[1])+'" fill="none" stroke="#ff5fa2" stroke-width="1" stroke-dasharray="4 3"/>';
 for(const [nm,p] of [['P0',c.P0],['P1',c.P1],['P2',c.P2],['P3',c.P3]])g+='<circle cx="'+X(p[0])+'" cy="'+Y(p[1])+'" r="3" fill="#ff5fa2"/>';
 pic.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="'+S+'" height="'+S+'" viewBox="0 0 '+S+' '+S+'">'+g+'</svg>';
 const vcap=Math.sqrt(8000*st.Rmin);
 info.innerHTML='<b>R_кривизны</b> '+st.Rmin.toFixed(2)+' мм<br><b>излом</b> '+st.maxTurn.toFixed(1)+'°<br><b>мин. зазор</b> '+st.minGap.toFixed(2)+' мм<br><b>ближе к центру</b> '+st.rMinOrigin.toFixed(2)+' мм<br><b>предел скорости</b> '+vcap.toFixed(0)+' мм/с<br><b>длина</b> '+st.len.toFixed(0)+' мм';}
['R','rc','N','L'].forEach(id=>document.getElementById(id).addEventListener('input',render));
render();
</script></html>`;
}

// --- схема в стиле ТЗ: одна спираль + S-кудок в центре ---
function svgSchema(P, M) {
  const { path, ctrl, parts } = M;
  const S = 620, pad = 3, size = 2 * (P.R + pad);
  const X = (x) => (S / 2 + x * (S / size)).toFixed(2);
  const Y = (y) => (S / 2 - y * (S / size)).toFixed(2);
  const pathOf = (arr) => arr.map((q, i) => `${i ? 'L' : 'M'} ${X(q.x)} ${Y(q.y)}`).join(' ');
  let g = `<rect width="${S}" height="${S + 40}" fill="#ffffff"/>`;
  // диагональ-ориентир, как в схеме
  const d = P.R * 0.82;
  g += `<line x1="${X(-d)}" y1="${Y(d)}" x2="${X(d)}" y2="${Y(-d)}" stroke="#c9d4e4" stroke-width="1.5"/>`;
  // окружности витков — тонкие, как сетка
  g += `<circle cx="${S / 2}" cy="${S / 2}" r="${(P.R * (S / size)).toFixed(2)}" fill="none" stroke="#dfe6ef" stroke-width="1"/>`;
  // спираль (одна непрерывная линия) и S-кудок
  g += `<path d="${pathOf(parts.in)}" fill="none" stroke="#1f6fd0" stroke-width="2.4" stroke-linejoin="round"/>`;
  g += `<path d="${pathOf(parts.s)}" fill="none" stroke="#1f6fd0" stroke-width="2.4" stroke-linejoin="round"/>`;
  // углы 180° на дугах S-кудка
  const lbl = (px, py, txt, rot) => `<text x="${X(px)}" y="${Y(py)}" fill="#1f6fd0" font-size="13" font-family="monospace" text-anchor="middle" transform="rotate(${rot} ${X(px)} ${Y(py)})">${txt}</text>`;
  g += lbl(P.rc * 0.15, P.rc * 0.55, '180°', -45);
  g += lbl(-P.rc * 0.15, -P.rc * 0.55, '180°', -45);
  const st = M.stats;
  g += `<text x="14" y="${S + 22}" fill="#334" font-size="12" font-family="monospace">R=${P.R} rc=${P.rc} N=${P.N} L=${P.L} | R_кривизны=${st.Rmin.toFixed(2)} мм | излом=${st.maxTurn.toFixed(1)}° | до центра=${st.rMinOrigin.toFixed(2)} мм</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S + 40}" viewBox="0 0 ${S} ${S + 40}" font-family="monospace">${g}</svg>`;
}

// --- прогон ---
const M = build(P, 'spec');
M.stats = metrics(M.path);
console.log('Параметры ТЗ:', JSON.stringify(P));
console.log('метрики (как в ТЗ):', JSON.stringify({
  Rmin: +M.stats.Rmin.toFixed(3),
  maxTurn: +M.stats.maxTurn.toFixed(2),
  minGap: +M.stats.minGap.toFixed(3),
  rMinOrigin: +M.stats.rMinOrigin.toFixed(3),
  len: +M.stats.len.toFixed(1)
}));
console.log('предел скорости в центре (a=8000):', Math.sqrt(8000 * M.stats.Rmin).toFixed(0), 'мм/с');

const Mf = build(P, 'fixed');
Mf.stats = metrics(Mf.path);
console.log('метрики (исправленная вторая ветвь):', JSON.stringify({
  Rmin: +Mf.stats.Rmin.toFixed(3),
  maxTurn: +Mf.stats.maxTurn.toFixed(2),
  minGap: +Mf.stats.minGap.toFixed(3),
  rMinOrigin: +Mf.stats.rMinOrigin.toFixed(3),
  len: +Mf.stats.len.toFixed(1)
}));

// пропорции как на схеме из ТЗ: около трёх витков
const P3 = { ...P, N: 3 };
P3.d = P3.R - P3.rc;
P3.w = TAU * P3.N;
const M3 = build(P3, 'spec');
M3.stats = metrics(M3.path);
console.log('метрики (N=3, пропорции схемы):', JSON.stringify({
  Rmin: +M3.stats.Rmin.toFixed(3),
  maxTurn: +M3.stats.maxTurn.toFixed(2),
  minGap: +M3.stats.minGap.toFixed(3),
  rMinOrigin: +M3.stats.rMinOrigin.toFixed(3),
  len: +M3.stats.len.toFixed(1)
}));

const outSvg = 'C:/Users/Christian/Desktop/3D-print-FDM-calculator/tools/spiral-s.svg';
const outSvgF = 'C:/Users/Christian/Desktop/3D-print-FDM-calculator/tools/spiral-s-fixed.svg';
const outSvgS = 'C:/Users/Christian/Desktop/3D-print-FDM-calculator/tools/spiral-s-schema.svg';
const outHtml = 'C:/Users/Christian/Desktop/3D-print-FDM-calculator/tools/spiral-s.html';
writeFileSync(outSvg, svg(P, M));
writeFileSync(outSvgF, svg(P, Mf));
writeFileSync(outSvgS, svgSchema(P, M));
writeFileSync('C:/Users/Christian/Desktop/3D-print-FDM-calculator/tools/spiral-s-schema-n3.svg', svgSchema(P3, M3));
writeFileSync(outHtml, html(P));
console.log('записано:', outSvg, ',', outSvgF, ',', outSvgS, ', схема N=3 и', outHtml);
