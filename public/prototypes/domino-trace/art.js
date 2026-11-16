// Drawn versions of the trace pictures, shown once the pieces come together. Each one draws in the picture's
// cells (22 x 20 units) so its shapes sit where the cells were, and moves with the time t.
const ART = (() => {
  const TAU = Math.PI * 2, INK = '#2a2d3a';
  const circle = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  const oval = (ctx, x, y, rx, ry, c, rot = 0) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); };
  const stroke = (ctx, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); };
  // 0, then a bump up to 1 and back, `len` long, every `every` seconds.
  const pulse = (t, every, len) => { const p = t % every; return p < len ? Math.sin(p / len * Math.PI) : 0; };
  const drift = (t, speed, x0) => (t * speed + x0) % 28 - 3;
  function radial(ctx, x, y, r, stops) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
    stops.forEach((c, k) => g.addColorStop(k / (stops.length - 1), c));
    return g;
  }
  function back(ctx, top, bottom) {
    const g = ctx.createLinearGradient(0, 0, 0, 20);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 22, 20);
  }
  function cloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    for (const [dx, dy, r] of [[-1.2, 0.25, 0.75], [-0.2, -0.3, 1], [1, 0.1, 0.85], [0.3, 0.5, 0.75], [-0.7, 0.55, 0.6]]) {
      ctx.moveTo(x + (dx + r) * s, y + dy * s);
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
    }
    ctx.fill();
  }
  function grass(ctx, y, t) {
    ctx.fillStyle = '#5cbf5a';
    ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, y + 0.4); ctx.quadraticCurveTo(11, y - 0.8, 22, y + 0.4); ctx.lineTo(22, 20); ctx.fill();
    ctx.beginPath();
    for (let x = 0.6; x < 22; x += 1.3) {
      const top = y + 0.35 - 0.6 * Math.sin(x * 1.7) ** 2, lean = 0.15 * Math.sin(t * 2 + x);
      ctx.moveTo(x - 0.2, y + 1); ctx.quadraticCurveTo(x, y + 0.5, x + lean, top);
    }
    stroke(ctx, '#3f9e48', 0.16);
  }
  function flower(ctx, x, y, c, t, k) {
    const sway = 0.12 * Math.sin(t * 1.8 + k);
    ctx.beginPath(); ctx.moveTo(x, 20); ctx.quadraticCurveTo(x, y + 1, x + sway * 4, y);
    stroke(ctx, '#3f9e48', 0.18);
    for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + sway; circle(ctx, x + sway * 4 + 0.42 * Math.cos(a), y + 0.42 * Math.sin(a), 0.32, c); }
    circle(ctx, x + sway * 4, y, 0.25, '#ffd23f');
  }
  // An eye that blinks now and then.
  function eye(ctx, x, y, r, t, seed = 0) {
    if ((t + seed) % 3.3 > 3.15) {
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y + r * 0.7, x + r, y);
      stroke(ctx, INK, r * 0.45);
      return;
    }
    circle(ctx, x, y, r, INK);
    circle(ctx, x - r * 0.3, y - r * 0.35, r * 0.36, '#fff');
  }
  function cheeks(ctx, x, y, dx, r) {
    oval(ctx, x - dx, y, r, r * 0.6, 'rgba(255,100,120,0.42)');
    oval(ctx, x + dx, y, r, r * 0.6, 'rgba(255,100,120,0.42)');
  }
  function smile(ctx, x, y, w, lw) {
    ctx.beginPath(); ctx.arc(x, y - w * 0.7, w, 0.22 * Math.PI, 0.78 * Math.PI);
    stroke(ctx, INK, lw);
  }
  function heart(ctx, x, y, s) {
    ctx.beginPath(); ctx.moveTo(x, y - 0.45 * s);
    ctx.bezierCurveTo(x - 0.25 * s, y - 1.05 * s, x - 1.2 * s, y - 0.95 * s, x - 1.05 * s, y - 0.2 * s);
    ctx.bezierCurveTo(x - 0.95 * s, y + 0.35 * s, x - 0.3 * s, y + 0.6 * s, x, y + s);
    ctx.bezierCurveTo(x + 0.3 * s, y + 0.6 * s, x + 0.95 * s, y + 0.35 * s, x + 1.05 * s, y - 0.2 * s);
    ctx.bezierCurveTo(x + 1.2 * s, y - 0.95 * s, x + 0.25 * s, y - 1.05 * s, x, y - 0.45 * s);
    ctx.closePath();
  }
  function sun(ctx, x, y, r, t, rays) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.35);
    for (let k = 0; k < rays; k++) {
      const len = r * (1.32 + 0.08 * Math.sin(t * 3 + k * 1.7));
      ctx.fillStyle = k % 2 ? '#ffb627' : '#ffd23f';
      ctx.beginPath(); ctx.moveTo(-r * 0.16, -r * 0.92); ctx.lineTo(0, -len); ctx.lineTo(r * 0.16, -r * 0.92); ctx.fill();
      ctx.rotate(TAU / rays);
    }
    ctx.restore();
    circle(ctx, x, y, r, radial(ctx, x, y, r, ['#fff6b0', '#ffd23f', '#ffad1f']));
    eye(ctx, x - r * 0.34, y - r * 0.15, r * 0.1, t); eye(ctx, x + r * 0.34, y - r * 0.15, r * 0.1, t);
    cheeks(ctx, x, y + r * 0.15, r * 0.55, r * 0.15);
    smile(ctx, x, y + r * 0.26, r * 0.28, r * 0.06);
  }

  // A four-point sparkle.
  function twinkle(ctx, x, y, r, c) {
    ctx.fillStyle = c; ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, d = k % 2 ? r * 0.28 : r; ctx.lineTo(x + d * Math.cos(a), y + d * Math.sin(a)); }
    ctx.fill();
  }
  function night(ctx, t, top, bottom) {
    back(ctx, top, bottom);
    for (let i = 0; i < 22; i++) {
      const x = (i * 9.7 + 1.3) % 21 + 0.5, y = (i * 4.3 + 0.7) % 17;
      twinkle(ctx, x, y, 0.22 + 0.16 * Math.sin(t * 2.4 + i * 1.9), 'rgba(255,248,210,0.9)');
    }
  }

  return {
    Soleil(ctx, t) {
      back(ctx, '#58aef5', '#a9dcff');
      cloud(ctx, drift(t, 0.6, 4), 2.6, 1.1);
      cloud(ctx, drift(t, 0.4, 18), 17.4, 1.4);
      sun(ctx, 11, 9, 5.6, t, 12);
    },

    'Cœur'(ctx, t) {
      back(ctx, '#ffd3e2', '#ffb0ca');
      for (let i = 0; i < 7; i++) {
        const p = (t * 0.2 + i / 7) % 1;
        ctx.globalAlpha = Math.sin(p * Math.PI) * 0.75;
        heart(ctx, 1.8 + i * 3.1 + 0.6 * Math.sin(t * 1.5 + i * 2), 20.5 - p * 21, 0.55);
        ctx.fillStyle = '#ff7aa2'; ctx.fill();
      }
      ctx.globalAlpha = 1;
      const p = t % 1.2, beat = 1 + 0.07 * Math.exp(-(((p - 0.12) / 0.07) ** 2)) + 0.05 * Math.exp(-(((p - 0.36) / 0.07) ** 2));
      ctx.save(); ctx.translate(11, 9.8); ctx.scale(beat, beat);
      heart(ctx, 0, 0, 5.2);
      const g = ctx.createLinearGradient(0, -5, 0, 5.5);
      g.addColorStop(0, '#ff5d6c'); g.addColorStop(1, '#c81e3c');
      ctx.fillStyle = g; ctx.fill(); stroke(ctx, 'rgba(120,10,30,0.35)', 0.3);
      oval(ctx, -2.8, -2.5, 1.1, 0.6, 'rgba(255,255,255,0.75)', -0.7);
      circle(ctx, -1.5, -3.3, 0.3, 'rgba(255,255,255,0.75)');
      eye(ctx, -1.7, 0, 0.55, t); eye(ctx, 1.7, 0, 0.55, t);
      cheeks(ctx, 0, 1, 2.7, 0.75);
      smile(ctx, 0, 1.5, 1.2, 0.32);
      ctx.restore();
    },

    Arbre(ctx, t) {
      back(ctx, '#62b6f7', '#b6e3ff');
      cloud(ctx, drift(t, 0.5, 15), 2.2, 1);
      grass(ctx, 18.3, t);
      ctx.fillStyle = '#8b5a2b';
      ctx.beginPath(); ctx.moveTo(9.8, 19); ctx.quadraticCurveTo(10.5, 14, 10.25, 10.5); ctx.lineTo(11.75, 10.5); ctx.quadraticCurveTo(11.5, 14, 12.2, 19); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10.9, 16.5); ctx.lineTo(10.9, 17.6); ctx.moveTo(11.3, 14.2); ctx.lineTo(11.3, 15.4);
      stroke(ctx, 'rgba(60,30,10,0.4)', 0.14);
      // The crown sways on the trunk.
      ctx.save(); ctx.translate(11, 12); ctx.rotate(0.035 * Math.sin(t * 1.4)); ctx.translate(-11, -12);
      const blobs = [[11, 7.2, 4.2], [7.7, 8.4, 2.8], [14.3, 8.4, 2.8], [9, 4.9, 2.6], [13, 4.9, 2.6], [11, 9.9, 2.8]];
      for (const [x, y, r] of blobs) circle(ctx, x, y + 0.3, r, '#1f7a45');
      for (const [x, y, r] of blobs) circle(ctx, x, y, r, '#2f9b4f');
      for (const [x, y, r] of blobs) circle(ctx, x - r * 0.25, y - r * 0.3, r * 0.55, '#45b862');
      [[8.2, 8.9], [13.9, 9.3], [10.4, 5], [12.6, 11.3], [9.4, 11.2], [12.9, 6.3]].forEach(([x, y], k) => {
        const s = 0.12 * Math.sin(t * 2.2 + k);
        ctx.beginPath(); ctx.moveTo(x, y - 0.75); ctx.lineTo(x + s, y - 0.45); stroke(ctx, '#5a3a1a', 0.12);
        circle(ctx, x + s, y, 0.55, '#e8434d');
        circle(ctx, x + s - 0.18, y - 0.18, 0.16, 'rgba(255,255,255,0.8)');
      });
      ctx.restore();
      // A leaf drifts down now and then.
      const p = (t * 0.16) % 1;
      ctx.globalAlpha = Math.min(1, (1 - p) * 4);
      oval(ctx, 15 - p * 3 + Math.sin(t * 2) * 1.1, 10 + p * 8.4, 0.38, 0.18, '#45b862', Math.sin(t * 3));
      ctx.globalAlpha = 1;
    },

    Poussin(ctx, t) {
      back(ctx, '#62b6f7', '#c2e8ff');
      grass(ctx, 17.4, t);
      flower(ctx, 3, 17.2, '#ff6f91', t, 0); flower(ctx, 19.2, 17.6, '#ffffff', t, 2);
      const hop = pulse(t, 2.6, 0.45), flap = hop > 0 ? Math.sin(t * 30) : 0;
      oval(ctx, 11, 17.4, 4.2 * (1 - hop * 0.3), 0.6, 'rgba(0,60,20,0.25)');
      ctx.save(); ctx.translate(0, -0.9 * hop);
      for (const fx of [9.5, 12.5]) {
        ctx.beginPath(); ctx.moveTo(fx, 15.6); ctx.lineTo(fx, 16.9);
        ctx.moveTo(fx - 0.5, 17.1); ctx.lineTo(fx, 16.8); ctx.lineTo(fx + 0.5, 17.1);
        stroke(ctx, '#ff8a3d', 0.28);
      }
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(11 + side * 4.3, 11); ctx.rotate(side * (0.45 + 0.35 * flap));
        oval(ctx, 0, 1.1, 1.15, 2.1, '#f5b70f');
        ctx.restore();
      }
      const body = radial(ctx, 11, 12, 5.4, ['#fff3a0', '#ffd23f', '#f5b70f']);
      oval(ctx, 11, 12, 4.8, 4.5, body);
      oval(ctx, 11, 13, 3, 2.7, 'rgba(255,248,200,0.6)');
      circle(ctx, 11, 6.7, 3.2, radial(ctx, 11, 6.7, 3.4, ['#fff6b0', '#ffd23f', '#f7bd14']));
      oval(ctx, 10.4, 3.6, 0.32, 0.75, '#f7bd14', -0.5); oval(ctx, 11, 3.3, 0.32, 0.8, '#f7bd14'); oval(ctx, 11.6, 3.6, 0.32, 0.75, '#f7bd14', 0.5);
      eye(ctx, 9.8, 6.2, 0.5, t); eye(ctx, 12.2, 6.2, 0.5, t);
      cheeks(ctx, 11, 7.4, 2, 0.6);
      // The beak opens for a cheep.
      const o = 0.35 * pulse(t + 0.6, 1.9, 0.3);
      ctx.fillStyle = '#e46f22'; ctx.beginPath(); ctx.moveTo(10.5, 7.5 + o); ctx.lineTo(11.5, 7.5 + o); ctx.lineTo(11, 8.2 + o); ctx.fill();
      ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(10.2, 7.15); ctx.lineTo(11.8, 7.15); ctx.lineTo(11, 7.95); ctx.fill();
      ctx.restore();
    },

    Papillon(ctx, t) {
      back(ctx, '#7cc6ff', '#d4f0ff');
      flower(ctx, 3.2, 17.4, '#ff6f91', t, 0); flower(ctx, 11.4, 18.2, '#ffffff', t, 1.5); flower(ctx, 18.8, 17, '#ffd23f', t, 3);
      const bob = 0.35 * Math.sin(t * 1.4), open = 0.45 + 0.55 * Math.abs(Math.cos(t * 3.2));
      ctx.save(); ctx.translate(11, bob);
      for (const side of [-1, 1]) {
        ctx.save(); ctx.scale(side * open, 1);
        ctx.beginPath(); ctx.moveTo(-0.3, 6.6);
        ctx.bezierCurveTo(-3, 2.2, -8.6, 2.6, -8.2, 6.6); ctx.bezierCurveTo(-8, 10, -3.5, 10.6, -0.3, 9.6); ctx.closePath();
        let g = ctx.createLinearGradient(0, 0, -8, 0); g.addColorStop(0, '#7a3fd0'); g.addColorStop(1, '#b685f5');
        ctx.fillStyle = g; ctx.fill(); stroke(ctx, '#4b2390', 0.28);
        oval(ctx, -4.7, 6.4, 1.8, 1.4, '#dcbcff'); circle(ctx, -6.8, 5, 0.55, '#fff'); circle(ctx, -2.7, 4.9, 0.42, '#ffd23f');
        ctx.beginPath(); ctx.moveTo(-0.3, 9.8);
        ctx.bezierCurveTo(-3.8, 9.6, -6.4, 12.4, -5, 14.6); ctx.bezierCurveTo(-3.6, 16.2, -1, 13.6, -0.3, 11.6); ctx.closePath();
        g = ctx.createLinearGradient(0, 0, -6, 0); g.addColorStop(0, '#7a3fd0'); g.addColorStop(1, '#a56cf0');
        ctx.fillStyle = g; ctx.fill(); stroke(ctx, '#4b2390', 0.28);
        oval(ctx, -3.3, 12.5, 1, 0.8, '#ff6f91'); circle(ctx, -4.4, 14, 0.35, '#fff');
        ctx.restore();
      }
      oval(ctx, 0, 10, 0.65, 4.1, INK);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 0.3, 4.6); ctx.quadraticCurveTo(s * 1, 2.6, s * 2.2, 2.1);
        stroke(ctx, INK, 0.2);
        circle(ctx, s * 2.2, 2.1, 0.35, INK);
      }
      circle(ctx, 0, 5.3, 0.95, INK);
      circle(ctx, -0.35, 5.15, 0.2, '#fff'); circle(ctx, 0.35, 5.15, 0.2, '#fff');
      ctx.restore();
    },

    Colline(ctx, t) {
      back(ctx, '#58aef5', '#c4e9ff');
      sun(ctx, 15, 8.6, 2.9, t, 10);
      cloud(ctx, drift(t, 0.5, 2), 2.6, 1);
      cloud(ctx, drift(t, 0.3, 15), 4.6, 0.75);
      for (let i = 0; i < 2; i++) {
        const bx = drift(t, 1.1, 6 + i * 2.2), by = 5.2 + i * 0.9, f = 0.35 * Math.sin(t * 9 + i);
        ctx.beginPath(); ctx.moveTo(bx - 0.6, by - f); ctx.quadraticCurveTo(bx - 0.3, by - 0.3, bx, by); ctx.quadraticCurveTo(bx + 0.3, by - 0.3, bx + 0.6, by - f);
        stroke(ctx, INK, 0.14);
      }
      ctx.fillStyle = '#4cc36b'; ctx.beginPath(); ctx.ellipse(19, 23, 10, 9.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f9b4f'; ctx.beginPath(); ctx.ellipse(6, 24.5, 16, 13.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(4, 14, 5, 2.2, -0.2, 0, TAU); ctx.fill();
      // A winding path and flowers on the hill.
      ctx.beginPath(); ctx.moveTo(8, 20); ctx.bezierCurveTo(6, 17.5, 11, 15.5, 8.6, 12.4);
      stroke(ctx, '#e9c46a', 0.55);
      [[3, 15.6, '#ff6f91'], [13.4, 15, '#fff'], [16.8, 17.6, '#ffd23f'], [4.6, 18.4, '#fff'], [11.4, 18.6, '#ff6f91'], [19.6, 15.4, '#ff6f91']].forEach(([x, y, c], k) => {
        const s = 1 + 0.12 * Math.sin(t * 2 + k);
        for (let i = 0; i < 5; i++) circle(ctx, x + 0.3 * s * Math.cos(i * TAU / 5), y + 0.3 * s * Math.sin(i * TAU / 5), 0.22, c);
        circle(ctx, x, y, 0.16, '#ffd23f');
      });
    },

    'Sous-marin'(ctx, t) {
      back(ctx, '#2f7fe0', '#163a86');
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (let i = 0; i < 4; i++) {
        const x = 3 + i * 5.5 + Math.sin(t * 0.5 + i) * 0.8;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 1.6, 0); ctx.lineTo(x + 4, 20); ctx.lineTo(x + 1.4, 20); ctx.fill();
      }
      ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, 18.6); ctx.quadraticCurveTo(11, 17.6, 22, 18.8); ctx.lineTo(22, 20); ctx.fill();
      for (const [x, h, k] of [[2.4, 3.4, 0], [3.4, 2.4, 1], [18.6, 3.8, 2], [19.8, 2.6, 3]]) {
        ctx.beginPath(); ctx.moveTo(x, 19);
        ctx.quadraticCurveTo(x + 0.7 * Math.sin(t * 1.6 + k), 19 - h / 2, x + 0.5 * Math.sin(t * 1.6 + k + 1), 19 - h);
        stroke(ctx, '#2f9b4f', 0.4);
      }
      // A fish swims by.
      const fx = 25 - (t * 1.6) % 30, fy = 16 + 0.3 * Math.sin(t * 2);
      oval(ctx, fx, fy, 0.9, 0.55, '#ff8a3d');
      ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(fx + 0.7, fy); ctx.lineTo(fx + 1.5, fy - 0.5 + 0.15 * Math.sin(t * 12)); ctx.lineTo(fx + 1.5, fy + 0.5 + 0.15 * Math.sin(t * 12)); ctx.fill();
      circle(ctx, fx - 0.45, fy - 0.1, 0.13, INK);
      // Bubbles from the propeller and the periscope.
      for (let i = 0; i < 9; i++) {
        const p = (t * 0.35 + i / 9) % 1, fromProp = i % 3 > 0;
        const bx = (fromProp ? 3.4 : 12.4) + 0.4 * Math.sin(t * 3 + i * 2) + (fromProp ? -p * 1.5 : 0), by = (fromProp ? 11 : 5.4) - p * (fromProp ? 11 : 6);
        ctx.beginPath(); ctx.arc(bx, by, 0.18 + 0.25 * p, 0, TAU);
        stroke(ctx, `rgba(220,240,255,${0.8 * (1 - p)})`, 0.1);
      }
      const bob = 0.35 * Math.sin(t * 1.6);
      ctx.save(); ctx.translate(11, 11 + bob); ctx.rotate(0.03 * Math.sin(t * 1.6 + 1)); ctx.translate(-11, -11);
      ctx.beginPath(); ctx.moveTo(11.6, 7.6); ctx.lineTo(11.6, 5.6); ctx.lineTo(12.6, 5.6);
      stroke(ctx, '#c9971a', 0.45);
      ctx.fillStyle = '#ffc21f'; CC.roundRect(ctx, 8.8, 7.1, 4.4, 2.2, 0.8); ctx.fill();
      // Propeller: two blades seen turning.
      const turn = Math.cos(t * 14);
      oval(ctx, 3.3, 11 - 0.8 * turn, 0.35, Math.abs(0.8 * turn) + 0.1, '#9aa3b5');
      oval(ctx, 3.3, 11 + 0.8 * turn, 0.35, Math.abs(0.8 * turn) + 0.1, '#9aa3b5');
      oval(ctx, 11, 11, 7.4, 2.7, radial(ctx, 11, 11, 7.4, ['#fff2a0', '#ffd23f', '#e8a90e']));
      ctx.fillStyle = '#ffb627'; ctx.beginPath(); ctx.moveTo(4.2, 10.4); ctx.lineTo(3.4, 8.8); ctx.lineTo(5.4, 9.6); ctx.fill();
      for (const x of [7.6, 11, 14.4]) {
        circle(ctx, x, 11, 0.95, '#c9971a');
        circle(ctx, x, 11, 0.72, radial(ctx, x, 11, 0.72, ['#e4f6ff', '#7fc4ff', '#3f8fd8']));
      }
      smile(ctx, 16.8, 11.9, 0.7, 0.2);
      ctx.restore();
    },

    Lapin(ctx, t) {
      back(ctx, '#62b6f7', '#c8ebff');
      grass(ctx, 17.6, t);
      flower(ctx, 2.6, 17.4, '#ffd23f', t, 0); flower(ctx, 19.6, 17.8, '#ff6f91', t, 2);
      const twitch = 0.28 * pulse(t, 2.9, 0.35);
      const ear = (x, rot) => {
        ctx.save(); ctx.translate(x, 8); ctx.rotate(rot);
        oval(ctx, 0, -3.4, 1.45, 3.5, '#ffffff'); stroke(ctx, '#cfd5df', 0.2);
        oval(ctx, 0, -3.2, 0.75, 2.6, '#ffb3c8');
        ctx.restore();
      };
      ear(9, -0.16); ear(13, 0.16 + twitch);
      oval(ctx, 11, 12, 5, 4.6, radial(ctx, 11, 12, 5.4, ['#ffffff', '#ffffff', '#e3e7ee']));
      stroke(ctx, '#cfd5df', 0.2);
      eye(ctx, 9.2, 11, 0.6, t); eye(ctx, 12.8, 11, 0.6, t, 1.3);
      cheeks(ctx, 11, 12.9, 2.9, 0.8);
      const n = 0.08 * Math.sin(t * 14) * (pulse(t + 1, 2.2, 0.6) > 0 ? 1 : 0);
      ctx.fillStyle = '#ff6f91'; ctx.beginPath(); ctx.moveTo(10.5, 12.5 + n); ctx.lineTo(11.5, 12.5 + n); ctx.lineTo(11, 13.1 + n); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(11, 13.1 + n); ctx.lineTo(11, 13.6);
      ctx.arc(10.55, 13.6, 0.45, 0, Math.PI * 0.85); ctx.moveTo(11, 13.6); ctx.arc(11.45, 13.6, 0.45, Math.PI, Math.PI * 0.15, true);
      stroke(ctx, INK, 0.16);
      ctx.fillStyle = '#fff'; ctx.fillRect(10.65, 14, 0.7, 0.55); ctx.strokeStyle = '#cfd5df'; ctx.lineWidth = 0.08; ctx.strokeRect(10.65, 14, 0.7, 0.55);
      ctx.beginPath();
      for (const s of [-1, 1]) for (const dy of [-0.25, 0.25]) { ctx.moveTo(11 + s * 1.4, 13.2 + dy); ctx.lineTo(11 + s * 3.2, 13 + dy * 2.4 + n); }
      stroke(ctx, 'rgba(42,45,58,0.45)', 0.09);
    },

    'Cerf-volant'(ctx, t) {
      back(ctx, '#58aef5', '#bfe6ff');
      cloud(ctx, drift(t, 0.7, 3), 3.4, 1.2);
      cloud(ctx, drift(t, 0.45, 17), 16, 1);
      const sx = 0.5 * Math.sin(t * 0.9), rot = 0.12 * Math.sin(t * 1.3);
      ctx.beginPath(); ctx.moveTo(11 + sx, 8.5); ctx.quadraticCurveTo(15 + sx, 15, 21, 21);
      stroke(ctx, 'rgba(255,255,255,0.8)', 0.1);
      ctx.save(); ctx.translate(11 + sx, 8.5); ctx.rotate(rot);
      // The tail waves behind it.
      ctx.beginPath(); ctx.moveTo(0, 5.6);
      const tail = s => [Math.sin(s * 1.3 - t * 4) * s * 0.18, 5.6 + s];
      for (let s = 0; s <= 5.3; s += 0.25) ctx.lineTo(...tail(s));
      stroke(ctx, INK, 0.12);
      [[1.8, '#ffd23f'], [3.5, '#2f6fd6'], [5.2, '#ffd23f']].forEach(([s, c]) => {
        const [x, y] = tail(s);
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 0.8, y - 0.45); ctx.lineTo(x - 0.8, y + 0.45); ctx.lineTo(x, y); ctx.lineTo(x + 0.8, y - 0.45); ctx.lineTo(x + 0.8, y + 0.45); ctx.fill();
      });
      const quads = [[[0, -6.5], [-5.2, -0.6], '#e8434d'], [[0, -6.5], [5.2, -0.6], '#ff6b5b'], [[0, 5.6], [-5.2, -0.6], '#ff6b5b'], [[0, 5.6], [5.2, -0.6], '#e8434d']];
      for (const [a, b, c] of quads) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -0.6); ctx.lineTo(...a); ctx.lineTo(...b); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(-5.2, -0.6); ctx.lineTo(0, 5.6); ctx.lineTo(5.2, -0.6); ctx.closePath();
      stroke(ctx, '#9c2030', 0.25);
      ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(0, 5.6); ctx.moveTo(-5.2, -0.6); ctx.lineTo(5.2, -0.6);
      stroke(ctx, '#ffd23f', 0.42);
      eye(ctx, -1.8, -2.4, 0.5, t); eye(ctx, 1.8, -2.4, 0.5, t);
      cheeks(ctx, 0, 1.2, 2.2, 0.6);
      smile(ctx, 0, 1.4, 1.1, 0.28);
      ctx.restore();
    },

    'Éléphant'(ctx, t) {
      back(ctx, '#62b6f7', '#c8ebff');
      grass(ctx, 18, t);
      const flapL = 0.85 + 0.15 * Math.sin(t * 2.5), flapR = 0.85 + 0.15 * Math.sin(t * 2.5 + 0.5);
      for (const [s, f] of [[-1, flapL], [1, flapR]]) {
        ctx.save(); ctx.translate(11 + s * 2.8, 8.4); ctx.scale(f, 1);
        oval(ctx, s * 2.8, 0, 3.3, 3.8, '#8d97ab'); stroke(ctx, '#6c7487', 0.22);
        oval(ctx, s * 3, 0.2, 2.2, 2.7, '#ffb3c8');
        ctx.restore();
      }
      const swing = 1.1 * Math.sin(t * 1.6), end = [11 + swing, 16.6];
      ctx.beginPath(); ctx.moveTo(11, 10);
      ctx.bezierCurveTo(11, 13.5, 11 + swing * 0.4, 15, end[0], end[1]);
      ctx.quadraticCurveTo(end[0] + 0.4 + swing * 0.2, end[1] + 0.9, end[0] + 1.1, end[1] + 0.2);
      stroke(ctx, '#6c7487', 1.95);
      stroke(ctx, '#9aa3b5', 1.6);
      for (let k = 0; k < 4; k++) {
        const y = 12.4 + k * 1.05, x = 11 + swing * 0.22 * k;
        ctx.beginPath(); ctx.moveTo(x - 0.55, y); ctx.quadraticCurveTo(x, y + 0.25, x + 0.55, y);
        stroke(ctx, 'rgba(70,76,96,0.35)', 0.1);
      }
      oval(ctx, 11, 8.4, 3.9, 4, radial(ctx, 11, 8.4, 4.3, ['#c2c9d6', '#9aa3b5', '#858ea2']));
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(11 + s * 1.5, 11.3); ctx.quadraticCurveTo(11 + s * 1.9, 12.8, 11 + s * 1.1, 13.1);
        stroke(ctx, '#fffaf0', 0.42);
      }
      eye(ctx, 9.5, 7.8, 0.55, t); eye(ctx, 12.5, 7.8, 0.55, t, 0.8);
      cheeks(ctx, 11, 9.6, 2.5, 0.75);
      ctx.beginPath(); ctx.moveTo(10.6, 4.6); ctx.quadraticCurveTo(10.5, 3.6, 10.1, 3.4); ctx.moveTo(11, 4.5); ctx.quadraticCurveTo(11, 3.5, 11.3, 3.2);
      stroke(ctx, '#6c7487', 0.16);
    },

    Tortue(ctx, t) {
      back(ctx, '#62b6f7', '#c8ebff');
      cloud(ctx, drift(t, 0.4, 6), 3, 1.1);
      grass(ctx, 16.4, t);
      flower(ctx, 20, 16.2, '#ff6f91', t, 1); flower(ctx, 1.8, 16.6, '#ffd23f', t, 3);
      const walk = Math.sin(t * 3), bob = 0.15 * Math.abs(Math.cos(t * 3));
      oval(ctx, 10.4, 16.4, 6.4, 0.6, 'rgba(0,60,20,0.25)');
      // The legs go in pairs, in turn.
      for (const [x, pair] of [[8.6, 1], [14, 1], [6.6, 0], [12.2, 0]]) {
        ctx.save(); ctx.translate(x, 13.4); ctx.rotate((pair ? -1 : 1) * walk * 0.22);
        ctx.fillStyle = pair ? '#4fa957' : '#6fcf75'; CC.roundRect(ctx, -0.75, 0, 1.5, 2.9, 0.7); ctx.fill();
        ctx.restore();
      }
      ctx.save(); ctx.translate(0, -bob);
      ctx.fillStyle = '#6fcf75'; ctx.beginPath(); ctx.moveTo(4.9, 12.6); ctx.lineTo(3.1, 13.6 + 0.25 * walk); ctx.lineTo(5.1, 13.8); ctx.fill();
      const hx = 16.6 + 0.3 * Math.sin(t * 3 + 1), hy = 10.2;
      ctx.beginPath(); ctx.moveTo(14.2, 12.8); ctx.quadraticCurveTo(15.4, 11, hx, hy);
      stroke(ctx, '#6fcf75', 1.7);
      oval(ctx, hx + 0.6, hy - 0.2, 2, 1.65, '#6fcf75');
      eye(ctx, hx + 1, hy - 0.6, 0.45, t);
      oval(ctx, hx + 0.1, hy + 0.4, 0.45, 0.28, 'rgba(255,100,120,0.42)');
      smile(ctx, hx + 1.4, hy + 0.45, 0.6, 0.16);
      ctx.beginPath(); ctx.moveTo(4.4, 13.6); ctx.bezierCurveTo(4.4, 6, 15.8, 6, 15.8, 13.6); ctx.closePath();
      ctx.fillStyle = radial(ctx, 10.1, 11, 6.4, ['#8fe07a', '#3fae55', '#23804a']); ctx.fill();
      stroke(ctx, '#1d5e33', 0.25);
      for (const [x, y, rx, ry] of [[10.1, 10.6, 2, 1.5], [6.9, 12, 1.4, 1.1], [13.3, 12, 1.4, 1.1], [7.9, 9.2, 1.1, 0.75], [12.3, 9.2, 1.1, 0.75]]) oval(ctx, x, y, rx, ry, 'rgba(190,245,160,0.5)');
      ctx.fillStyle = '#e9c46a'; CC.roundRect(ctx, 4, 13.1, 12.2, 1.1, 0.55); ctx.fill();
      ctx.restore();
    },

    Glace(ctx, t) {
      back(ctx, '#ffe7c8', '#ffc9a8');
      [[3, 4], [19, 3], [2.6, 14], [19.4, 12.6], [17, 18], [5, 18.4]].forEach(([x, y], i) => twinkle(ctx, x, y, 0.45 + 0.3 * Math.sin(t * 3 + i * 2), 'rgba(255,255,255,0.85)'));
      ctx.save();
      ctx.beginPath(); ctx.moveTo(7.3, 10.8); ctx.lineTo(14.7, 10.8); ctx.lineTo(11, 19.4); ctx.closePath();
      ctx.fillStyle = '#e9b56a'; ctx.fill(); stroke(ctx, '#b07a35', 0.25);
      ctx.clip();
      ctx.beginPath();
      for (let k = -8; k < 10; k += 1.3) { ctx.moveTo(7 + k, 10.5); ctx.lineTo(15 + k, 20); ctx.moveTo(15 - k, 10.5); ctx.lineTo(7 - k, 20); }
      stroke(ctx, '#c48a42', 0.16);
      ctx.restore();
      // A drip grows under the scoop, then falls.
      const p = (t * 0.4) % 1;
      if (p < 0.75) { ctx.beginPath(); ctx.moveTo(8.4, 11.4); ctx.lineTo(8.4, 11.4 + p / 0.75 * 1.5); stroke(ctx, '#ff9ec0', 0.55); }
      else { ctx.globalAlpha = 1 - (p - 0.75) * 4; circle(ctx, 8.4, 12.9 + (p - 0.75) * 24, 0.3, '#ff9ec0'); ctx.globalAlpha = 1; }
      circle(ctx, 11, 9.4, 3.9, '#ff9ec0');
      for (let x = 7.8; x <= 14.3; x += 1.6) circle(ctx, x, 11.1, 0.85, '#ff9ec0');
      oval(ctx, 9.4, 7.6, 1, 0.55, 'rgba(255,255,255,0.5)', -0.5);
      eye(ctx, 9.7, 9.3, 0.5, t); eye(ctx, 12.3, 9.3, 0.5, t, 1);
      cheeks(ctx, 11, 10.2, 2.1, 0.6);
      smile(ctx, 11, 10.5, 0.9, 0.24);
      ctx.save(); ctx.translate(11, 6.6); ctx.rotate(0.06 * Math.sin(t * 2.4));
      circle(ctx, 0, -1.2, 3, '#9be3c5');
      for (let x = -2.4; x <= 2.5; x += 1.2) circle(ctx, x, 0.9, 0.7, '#9be3c5');
      [[-1.6, -2.4, 0.4, '#ff6f91'], [0.3, -3.2, -0.6, '#ffd23f'], [1.6, -1.8, 1, '#4a63e6'], [-0.6, -0.8, -0.2, '#ffffff'], [1.2, -0.2, 0.5, '#ff6f91'], [-2, -0.6, 1.2, '#ffd23f']].forEach(([x, y, a, c]) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = c; CC.roundRect(ctx, -0.35, -0.11, 0.7, 0.22, 0.11); ctx.fill(); ctx.restore();
      });
      // The cherry bounces.
      const cy = -4.6 - 0.45 * pulse(t, 1.6, 0.35);
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.quadraticCurveTo(0.4, cy - 1.2, 1.2, cy - 1.6);
      stroke(ctx, '#5a3a1a', 0.16);
      circle(ctx, 0, cy, 0.85, '#e8434d');
      circle(ctx, -0.28, cy - 0.28, 0.24, 'rgba(255,255,255,0.8)');
      ctx.restore();
    },

    'Fusée'(ctx, t) {
      night(ctx, t, '#141b45', '#3a2f7a');
      circle(ctx, 18.4, 4.4, 1.8, radial(ctx, 18.4, 4.4, 1.8, ['#ffc59a', '#ff9d5c', '#e0703a']));
      ctx.beginPath(); ctx.ellipse(18.4, 4.4, 3, 0.8, -0.35, 0, TAU); stroke(ctx, 'rgba(255,216,168,0.85)', 0.2);
      for (let i = 0; i < 5; i++) {
        const p = (t * 0.6 + i / 5) % 1;
        ctx.globalAlpha = 0.5 * (1 - p);
        circle(ctx, 11 + (i - 2) * 1.8 * p, 19.4 + p * 1.2, 0.8 + p * 1.6, '#c9cfe0');
      }
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(11 + 0.05 * Math.sin(t * 40), 0.25 * Math.sin(t * 1.5));
      const f = 1 + 0.22 * Math.sin(t * 25) + 0.12 * Math.sin(t * 37);
      ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(-1.4, 15.2); ctx.quadraticCurveTo(0, 15.2 + 4.2 * f, 1.4, 15.2); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-0.8, 15.2); ctx.quadraticCurveTo(0, 15.2 + 2.6 * f, 0.8, 15.2); ctx.fill();
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#e8434d'; ctx.beginPath(); ctx.moveTo(s * 1.9, 10.8); ctx.lineTo(s * 4.3, 15.3); ctx.lineTo(s * 1.7, 14.4); ctx.fill();
      }
      const body = () => { ctx.beginPath(); ctx.moveTo(0, 2.3); ctx.bezierCurveTo(3, 4.5, 2.6, 11, 2, 15.1); ctx.lineTo(-2, 15.1); ctx.bezierCurveTo(-2.6, 11, -3, 4.5, 0, 2.3); ctx.closePath(); };
      body();
      const g = ctx.createLinearGradient(-2.6, 0, 2.6, 0);
      g.addColorStop(0, '#c3cad6'); g.addColorStop(0.4, '#ffffff'); g.addColorStop(1, '#aab3c2');
      ctx.fillStyle = g; ctx.fill();
      ctx.save(); body(); ctx.clip();
      ctx.fillStyle = '#e8434d'; ctx.fillRect(-3, 2, 6, 2.9); ctx.fillRect(-3, 13.7, 6, 1.6);
      ctx.restore();
      body(); stroke(ctx, '#7f8899', 0.22);
      ctx.fillStyle = '#66757f'; CC.roundRect(ctx, -1.5, 14.9, 3, 0.8, 0.3); ctx.fill();
      circle(ctx, 0, 8.2, 1.65, '#9aa3b5');
      circle(ctx, 0, 8.2, 1.3, radial(ctx, 0, 8.2, 1.3, ['#e4f6ff', '#7fc4ff', '#3f8fd8']));
      eye(ctx, -0.45, 8, 0.22, t); eye(ctx, 0.45, 8, 0.22, t);
      smile(ctx, 0, 8.6, 0.4, 0.1);
      ctx.restore();
    },

    Chat(ctx, t) {
      back(ctx, '#ffe9c2', '#ffd59a');
      ctx.fillStyle = '#d9a066'; ctx.fillRect(0, 17.2, 22, 2.8);
      ctx.beginPath(); for (let x = 2; x < 22; x += 4.4) { ctx.moveTo(x, 17.2); ctx.lineTo(x, 20); } ctx.moveTo(0, 18.6); ctx.lineTo(22, 18.6);
      stroke(ctx, 'rgba(120,70,30,0.3)', 0.1);
      // A ball of yarn rocks on the floor.
      ctx.save(); ctx.translate(4 + 0.3 * Math.sin(t * 1.2), 16.1); ctx.rotate(0.3 * Math.sin(t * 1.2));
      circle(ctx, 0, 0, 1.4, '#4a63e6');
      ctx.beginPath(); ctx.arc(0, 0, 1, -0.5, 1.6); ctx.moveTo(-1.2, -0.4); ctx.quadraticCurveTo(0, 0.4, 1.1, -0.7); ctx.moveTo(-0.8, 0.9); ctx.quadraticCurveTo(0.2, 0, 0.6, 1.2);
      stroke(ctx, '#2f45b8', 0.14);
      ctx.restore();
      // The tail swishes.
      const sw = Math.sin(t * 2);
      ctx.beginPath(); ctx.moveTo(13.8, 15.8); ctx.bezierCurveTo(17.5, 16.2, 17.6 + sw, 12.5, 16.8 + 1.4 * sw, 10.2);
      stroke(ctx, '#e07a1f', 1.25); stroke(ctx, '#ff9d3c', 0.95);
      oval(ctx, 11, 14, 4, 3.9, '#ff9d3c');
      oval(ctx, 11, 14.9, 2.2, 2.5, '#ffe0b8');
      ctx.beginPath(); ctx.moveTo(7.3, 13); ctx.quadraticCurveTo(8, 13.4, 8.3, 14.2); ctx.moveTo(14.7, 13); ctx.quadraticCurveTo(14, 13.4, 13.7, 14.2);
      stroke(ctx, '#e07a1f', 0.3);
      oval(ctx, 9.3, 17.5, 1.05, 0.6, '#ffb260'); oval(ctx, 12.7, 17.5, 1.05, 0.6, '#ffb260');
      const twitch = 0.2 * pulse(t, 3.1, 0.3);
      for (const [s, a] of [[-1, 0], [1, twitch]]) {
        ctx.save(); ctx.translate(11 + s * 2.5, 5.6); ctx.rotate(s * a);
        ctx.fillStyle = '#ff9d3c'; ctx.beginPath(); ctx.moveTo(-1.5 * s, 0.6); ctx.lineTo(-0.6 * s, -3.4); ctx.lineTo(1.8 * s, -0.2); ctx.fill();
        ctx.fillStyle = '#ffb3c8'; ctx.beginPath(); ctx.moveTo(-0.9 * s, 0.1); ctx.lineTo(-0.5 * s, -2.3); ctx.lineTo(0.9 * s, -0.4); ctx.fill();
        ctx.restore();
      }
      oval(ctx, 11, 7.9, 4.1, 3.4, '#ff9d3c');
      ctx.beginPath(); ctx.moveTo(10.2, 4.7); ctx.lineTo(10.4, 5.7); ctx.moveTo(11, 4.6); ctx.lineTo(11, 5.8); ctx.moveTo(11.8, 4.7); ctx.lineTo(11.6, 5.7);
      stroke(ctx, '#e07a1f', 0.3);
      oval(ctx, 11, 9.3, 1.7, 1.05, '#ffe0b8');
      eye(ctx, 9.3, 7.5, 0.62, t); eye(ctx, 12.7, 7.5, 0.62, t);
      cheeks(ctx, 11, 9, 2.8, 0.6);
      ctx.fillStyle = '#ff6f91'; ctx.beginPath(); ctx.moveTo(10.55, 8.6); ctx.lineTo(11.45, 8.6); ctx.lineTo(11, 9.1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(11, 9.1); ctx.lineTo(11, 9.5);
      ctx.arc(10.6, 9.5, 0.4, 0, Math.PI * 0.85); ctx.moveTo(11, 9.5); ctx.arc(11.4, 9.5, 0.4, Math.PI, Math.PI * 0.15, true);
      stroke(ctx, INK, 0.14);
      ctx.beginPath();
      for (const s of [-1, 1]) for (const dy of [-0.3, 0.2]) { ctx.moveTo(11 + s * 1.7, 9.2 + dy); ctx.lineTo(11 + s * 4, 8.9 + dy * 2.2); }
      stroke(ctx, 'rgba(42,45,58,0.5)', 0.09);
    },

    Lune(ctx, t) {
      night(ctx, t, '#18204a', '#3b4a8c');
      ctx.globalAlpha = 0.3; cloud(ctx, drift(t, 0.35, 3), 16.4, 1.4); cloud(ctx, drift(t, 0.25, 16), 3.2, 1); ctx.globalAlpha = 1;
      // The moon rocks in its sleep; zzz float away.
      ctx.save(); ctx.translate(10.4, 10); ctx.rotate(0.08 * Math.sin(t * 1.1));
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, 6.4, 0, TAU); ctx.clip();
      ctx.beginPath(); ctx.rect(-8, -8, 16, 16); ctx.arc(2.9, -1.6, 5.5, 0, TAU, true);
      ctx.fillStyle = radial(ctx, -2, 0, 7, ['#fffbe0', '#ffe58a', '#f5c842']); ctx.fill();
      circle(ctx, -4.6, 3, 0.5, 'rgba(220,170,40,0.4)'); circle(ctx, -2.2, 4.7, 0.35, 'rgba(220,170,40,0.4)');
      ctx.restore();
      ctx.beginPath(); ctx.arc(-4.1, -1.4, 0.55, 0.15 * Math.PI, 0.85 * Math.PI);
      stroke(ctx, INK, 0.2);
      oval(ctx, -4.5, 0.2, 0.65, 0.4, 'rgba(255,100,120,0.45)');
      ctx.beginPath(); ctx.arc(-3, 1.2, 0.5, 0.2 * Math.PI, 0.8 * Math.PI);
      stroke(ctx, INK, 0.16);
      ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.3 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(p * Math.PI);
        ctx.font = `800 ${0.9 + p * 1.1}px system-ui, sans-serif`; ctx.fillStyle = '#ffffff';
        ctx.fillText('z', 14.5 + p * 4 + 0.4 * Math.sin(t * 2 + i), 7 - p * 5.5);
      }
      ctx.globalAlpha = 1;
    },
  };
})();
