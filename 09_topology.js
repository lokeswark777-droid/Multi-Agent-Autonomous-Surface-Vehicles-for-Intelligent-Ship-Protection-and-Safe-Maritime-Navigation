// ==========================================================================
// 09_topology.js
// ADAPTIVE COMMUNICATION TOPOLOGY: dense mesh / mesh / ring / star / chain-relay selection.
// ==========================================================================

// ---------------- adaptive communication topology ----------------
const CL = [[100, 'STRONG', '#4dff9a', 0], [170, 'WEAK', '#ffe14d', .08], [260, 'RELAY', '#ff9a3c', .25]];
const cls = d => CL.find(c => d < c[0]);
/**
 * ADAPTIVE TOPOLOGY. Nodes = ship + living escorts. Link class by distance: <100 STRONG, <170 WEAK, <260 RELAY, else NONE.
 * Choice: hostile engaged -> STAR; fleet radius <110 -> DENSE MESH; <170 -> MESH; <260 -> RING; else CHAIN/RELAY (Prim MST).
 * 3 s minimum dwell; if any node is unreachable it falls back to the MST ('RELAY FALLBACK').
 * BFS from the ship gives hops and delivery probability for each escort (used by scan()).
 */
function comm() {
    const s = G.ship;
    const N = [s, ...G.esc.filter(e => e.alive)];
    const n = N.length;
    const D = N.map(a => N.map(b => H(a.x - b.x, a.y - b.y)));
    const cnt = {
        s: 0, w: 0, r: 0, n: 0
    };
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const c = cls(D[i][j]);
            c ? cnt[c[1][0].toLowerCase()]++ : cnt.n++;
        }
    }
    const all = l => {
        const E = [];
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (D[i][j] < l) {
                    E.push([i, j]);
                }
            }
        }
        return E;
    };
    const mst = () => {
        const E = [];
        const T = Array(n).fill(false);
        T[0] = true;
        for (let c = 1; c < n; c++) {
            let bi = -1;
            let bj = -1;
            let bd = 260;
            for (let i = 0; i < n; i++) {
                if (T[i]) {
                    for (let j = 0; j < n; j++) {
                        if (!T[j] && D[i][j] < bd) {
                            bd = D[i][j];
                            bi = i;
                            bj = j;
                        }
                    }
                }
            }
            if (bi < 0) {
                break;
            }
            E.push([bi, bj]);
            T[bj] = true;
        }
        return E;
    };
    const build = nm => {
        if (nm === 'DENSE MESH') {
            return all(260);
        }
        if (nm === 'MESH') {
            return all(170);
        }
        if (nm === 'CHAIN / RELAY') {
            return mst();
        }
        if (nm === 'STAR (COMBAT)') {
            const E = [];
            for (let j = 1; j < n; j++) {
                if (D[0][j] < 260) {
                    E.push([0, j]);
                }
            }
            return E;
        }
        const E = [];
        const ord = [...Array(Math.max(0, n - 1)).keys()].map(i => i + 1).sort((a, b) => Math.atan2(N[a].y - s.y, N[a].x - s.x) - Math.atan2(N[b].y - s.y, N[b].x - s.x));
        ord.forEach((a, i) => {
            const b = ord[(i + 1) % ord.length];
            if (a !== b && D[a][b] < 260 && !(ord.length === 2 && i)) {
                E.push([a, b]);
            }
        });
        ord.slice().sort((a, b) => D[0][a] - D[0][b]).slice(0, 2).forEach(a => {
            if (D[0][a] < 260) {
                E.push([0, a]);
            }
        });
        return E;
    };
    const bfs = E => {
        const adj = N.map(() => []);
        E.forEach(([a, b]) => {
            adj[a].push(b);
            adj[b].push(a);
        });
        const seen = Array(n).fill(false);
        const par = Array(n).fill(-1);
        const hop = Array(n).fill(0);
        const pr = Array(n).fill(0);
        seen[0] = true;
        pr[0] = 1;
        const q = [0];
        while (q.length) {
            const u = q.shift();
            for (const v of adj[u]) {
                if (!seen[v]) {
                    seen[v] = true;
                    par[v] = u;
                    hop[v] = hop[u] + 1;
                    const c = cls(D[u][v]);
                    pr[v] = pr[u] * (1 - (c ? c[3] : 1));
                    q.push(v);
                }
            }
        }
        return {
            seen, hop, pr
        };
    };
    const S = Math.max(0, ...D[0].slice(1));
    let want = G.combat ? 'STAR (COMBAT)' : S < 110 ? 'DENSE MESH' : S < 170 ? 'MESH' : S < 260 ? 'RING' : 'CHAIN / RELAY';
    const name = (G.t - G.tt < 3 && !G.combat && G.comm.base && G.comm.base !== 'STAR (COMBAT)') ? G.comm.base : want;
    let E = build(name);
    let B = bfs(E);
    let shown = name;
    if (B.seen.some(v => !v) && name !== 'CHAIN / RELAY') {
        const E2 = mst();
        const B2 = bfs(E2);
        if (B2.seen.filter(Boolean).length > B.seen.filter(Boolean).length) {
            E = E2;
            B = B2;
            shown = name + ' → RELAY FALLBACK';
        }
    }
    if (G.comm.base && name !== G.comm.base) {
        G.tt = G.t;
        log('TOPOLOGY: ' + G.comm.base + ' → ' + name + (G.combat ? ' (hostile engaged)' : ''), '#c58cff');
    }
    else if (!G.comm.base) {
        G.tt = G.t;
    }
    N.forEach((e, i) => {
        if (i) {
            e.reach = B.seen[i];
            e.hops = B.hop[i];
            e.p = B.pr[i];
            const c = cls(D[0][i]);
            e.link = !B.seen[i] ? 'NO LINK' : B.hop[i] === 1 && c ? c[1] : 'RELAY·' + B.hop[i] + 'hop';
        }
    });
    G.comm = {
        name: shown, base: name, edges: E, nodes: N, cnt, partial: B.seen.some(v => !v)
    };
}
// ---------------- LIVE GRAPHS DASHBOARD (key H) ----------------
function ghInit() {
    return {
        t: [], psi: [], cmd: [], rud: [], r: [], u: [], vd: [], cte: [], risk: [], fuel: [], hp: [], cpa: [], ls: [], lw: [], lr: [], ln: [], ed: [[], [], [], [], [], []], up: 0, pp: null
    };
}
/** Appends one sample (every 0.2 s) to the rolling 120 s history used by the graphs. */
function ghPush() {
    const s = G.ship;
    const q = G.gh;
    const d = G.dbg;
    const push = (k, v) => {
        q[k].push(v);
        if (q[k].length > GN) {
            q[k].shift();
        }
    };
    if (q.pp === null) {
        q.up = s.psi;
    }
    else {
        q.up += wrap(s.psi - q.pp);
    }
    q.pp = s.psi;
    push('t', G.t);
    push('psi', q.up * 57.296);
    push('cmd', (q.up + wrap(G.psid - s.psi)) * 57.296);
    push('rud', s.rud * 57.296);
    push('r', s.r * 57.296);
    push('u', H(s.u, s.v) * 1.944);
    push('vd', d ? d.vd * 1.944 : NaN);
    push('cte', G.cte);
    push('risk', G.risk);
    push('fuel', G.fuel);
    push('hp', s.hp);
    push('cpa', Math.min(G.cpa, 400));
    const c = G.comm.cnt;
    push('ls', c.s);
    push('lw', c.w);
    push('lr', c.r);
    push('ln', c.n);
    G.esc.forEach((e, i) => {
        const a = q.ed[i];
        a.push(e.alive ? H(e.x - s.x, e.y - s.y) : NaN);
        if (a.length > GN) {
            a.shift();
        }
    });
}
function chart(g, x, y, w, hh, title, series, o = {}) {
    g.fillStyle = 'rgba(6,22,38,.95)';
    g.strokeStyle = 'rgba(79,227,255,.35)';
    g.lineWidth = 1;
    g.fillRect(x, y, w, hh);
    g.strokeRect(x, y, w, hh);
    g.fillStyle = '#4fe3ff';
    g.font = 'bold 11px monospace';
    g.fillText(title, x + 8, y + 15);
    const px = x + 44;
    const py = y + 24;
    const pw = w - 56;
    const ph = hh - 44;
    let mn = o.min;
    let mx = o.max;
    if (mn === undefined || mx === undefined) {
        let lo = 1e9;
        let hi = -1e9;
        for (const s of series) {
            for (const v of s.d) {
                if (isFinite(v)) {
                    lo = Math.min(lo, v);
                    hi = Math.max(hi, v);
                }
            }
        }
        if (lo > hi) {
            lo = 0;
            hi = 1;
        }
        if (hi - lo < 1e-6) {
            hi = lo + 1;
        }
        const pad = (hi - lo) * .08;
        if (mn === undefined) {
            mn = lo - pad;
        }
        if (mx === undefined) {
            mx = hi + pad;
        }
    }
    g.font = '10px monospace';
    g.textAlign = 'right';
    g.fillStyle = '#8fd8ff';
    g.strokeStyle = 'rgba(140,210,255,.15)';
    for (let i = 0; i <= 4; i++) {
        const v = mn + (mx - mn) * i / 4;
        const yy = py + ph - ph * i / 4;
        g.beginPath();
        g.moveTo(px, yy);
        g.lineTo(px + pw, yy);
        g.stroke();
        g.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1), px - 4, yy + 3);
    }
    g.textAlign = 'left';
    let lx = px;
    for (const s of series) {
        g.strokeStyle = s.c;
        g.lineWidth = 1.6;
        g.setLineDash(s.dash || []);
        g.beginPath();
        let pen = false;
        const n = s.d.length;
        for (let i = 0; i < n; i++) {
            const v = s.d[i];
            if (!isFinite(v)) {
                pen = false;
                continue;
            }
            const xx = px + pw - (n - 1 - i) / (GN - 1) * pw;
            const yy = py + ph - (v - mn) / (mx - mn) * ph;
            pen ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
            pen = true;
        }
        g.stroke();
        g.setLineDash([]);
        const last = s.d.length ? s.d[s.d.length - 1] : NaN;
        g.fillStyle = s.c;
        g.fillRect(lx, y + hh - 14, 8, 8);
        g.fillStyle = '#cfeaff';
        const t = s.n + (isFinite(last) ? ' ' + (Math.abs(last) >= 100 ? last.toFixed(0) : last.toFixed(1)) : '');
        g.fillText(t, lx + 11, y + hh - 6);
        lx += t.length * 6 + 22;
    }
    g.fillStyle = '#5b7a92';
    g.textAlign = 'right';
    g.fillText('last 120 s', x + w - 6, y + 15);
    g.textAlign = 'left';
}
/** Redraws the 9-chart dashboard from G.gh (called ~10x per second while the Graphs overlay is open). */
/** Redraws the 9-chart live dashboard (key H): heading, rudder, speed, cross-track, fuel/hull, CPA, links, escort distances, controller comparison. */
function drawGraphs() {
    const dp = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(300, innerWidth - 20);
    const chh = Math.max(240, innerHeight - 246);
    if (gcv.width !== Math.round(cw * dp) || gcv.height !== Math.round(chh * dp)) {
        gcv.width = Math.round(cw * dp);
        gcv.height = Math.round(chh * dp);
        gcv.style.width = cw + 'px';
        gcv.style.height = chh + 'px';
    }
    const g = gcv.getContext('2d');
    g.setTransform(dp, 0, 0, dp, 0, 0);
    g.fillStyle = 'rgba(2,11,20,.97)';
    g.fillRect(0, 0, cw, chh);
    const cols = cw < 760 ? 2 : 3;
    const rows = Math.ceil(9 / cols);
    const gw = (cw - (cols + 1) * 8) / cols;
    const gh = (chh - (rows + 1) * 8) / rows;
    const q = G.gh;
    const at = i => [8 + (i % cols) * (gw + 8), 8 + Math.floor(i / cols) * (gh + 8)];
    let a;
    const cc = ['#4fe3ff', '#ffb347', '#4dff9a', '#ff4d5e', '#c58cff', '#ffe14d'];
    a = at(0);
    chart(g, a[0], a[1], gw, gh, '1  HEADING vs COMMAND [deg]', [{
            d: q.psi, c: cc[0], n: 'heading'
        }, {
            d: q.cmd, c: cc[1], n: 'command', dash: [5, 4]
        }]);
    a = at(1);
    chart(g, a[0], a[1], gw, gh, '2  RUDDER [deg] and YAW RATE [deg/s]', [{
            d: q.rud, c: cc[1], n: 'rudder'
        }, {
            d: q.r, c: cc[0], n: 'yaw rate'
        }]);
    a = at(2);
    chart(g, a[0], a[1], gw, gh, '3  SPEED [kn]', [{
            d: q.u, c: cc[2], n: 'speed'
        }, {
            d: q.vd, c: cc[3], n: 'desired', dash: [5, 4]
        }]);
    a = at(3);
    chart(g, a[0], a[1], gw, gh, '4  CROSS-TRACK [m] and ROUTE RISK', [{
            d: q.cte, c: cc[4], n: 'cross-track'
        }, {
            d: q.risk, c: cc[5], n: 'risk'
        }]);
    a = at(4);
    chart(g, a[0], a[1], gw, gh, '5  FUEL and HULL [%]', [{
            d: q.fuel, c: cc[5], n: 'fuel'
        }, {
            d: q.hp, c: cc[3], n: 'hull'
        }], { min: 0, max: 105 });
    a = at(5);
    chart(g, a[0], a[1], gw, gh, '6  CLOSEST-APPROACH CLEARANCE [m]', [{
            d: q.cpa, c: cc[3], n: 'CPA'
        }], { min: 0, max: 400 });
    a = at(6);
    chart(g, a[0], a[1], gw, gh, '7  LINKS: ' + G.comm.name, [{
            d: q.ls, c: cc[2], n: 'strong'
        }, {
            d: q.lw, c: cc[5], n: 'weak'
        }, {
            d: q.lr, c: '#ff9a3c', n: 'relay'
        }, {
            d: q.ln, c: '#8899aa', n: 'none'
        }], { min: 0 });
    a = at(7);
    chart(g, a[0], a[1], gw, gh, '8  ESCORT DISTANCE TO SHIP [m]', q.ed.map((d, i) => ({
        d, c: cc[i % 6], n: 'E' + (i + 1)
    })), { min: 0 });
    a = at(8);
    {
        const x = a[0];
        const y = a[1];
        g.fillStyle = 'rgba(6,22,38,.95)';
        g.strokeStyle = 'rgba(79,227,255,.35)';
        g.fillRect(x, y, gw, gh);
        g.strokeRect(x, y, gw, gh);
        g.fillStyle = '#4fe3ff';
        g.font = 'bold 11px monospace';
        g.fillText('9  CONTROLLER COMPARISON (AUTO mode, this mission)', x + 8, y + 15);
        const col = ['#2a6fdb', '#6c5ce7', '#12b5a6'];
        const nm = ['PID', 'SMC', 'MPC'];
        const st = G.ms.map(m => m.n > 10 ? { e: Math.sqrt(m.e2 / m.n) * 57.296, t: m.tv * 57.296 / (m.n * .2) * 60 } : null);
        if (!st.some(Boolean)) {
            g.fillStyle = '#8fd8ff';
            g.font = '12px monospace';
            g.fillText('collecting data... press K to try other controllers', x + 12, y + gh / 2);
        }
        else {
            const me = Math.max(1, ...st.map(v => v ? v.e : 0));
            const mt = Math.max(1, ...st.map(v => v ? v.t : 0));
            const bw = Math.min(34, (gw - 60) / 9);
            for (let m = 0; m < 2; m++) {
                const x0 = x + 20 + m * (gw / 2 - 4);
                const lab = m ? 'rudder travel [deg/min]' : 'RMS heading error [deg]';
                g.fillStyle = '#8fd8ff';
                g.font = '10px monospace';
                g.fillText(lab, x0, y + 34);
                for (let i = 0; i < 3; i++) {
                    const v = st[i] ? (m ? st[i].t : st[i].e) : 0;
                    const mx = m ? mt : me;
                    const bh = (gh - 90) * v / mx;
                    const bx = x0 + i * (bw + 8);
                    const by = y + gh - 34 - bh;
                    g.fillStyle = st[i] ? col[i] : '#334';
                    g.fillRect(bx, by, bw, Math.max(bh, 2));
                    g.fillStyle = '#cfeaff';
                    g.fillText(st[i] ? v.toFixed(m ? 0 : 1) : '-', bx, by - 4);
                    g.fillText(nm[i], bx, y + gh - 20);
                }
            }
        }
        g.fillStyle = '#5b7a92';
        g.font = '10px monospace';
        g.fillText('running: ' + HCN[HC], x + 8, y + gh - 6);
    }
}
