// Shared by both demos: seeded RNG, fixed-step loop, record hooks, finger, live sfx.
const CC = (() => {
  const params = new URLSearchParams(location.search);
  const cc = {
    W: 1080, H: 1920, DT: 1 / 30,
    recording: params.has('record'),
    auto: params.has('record') || params.has('auto'),
    time: 0,
    events: [],
    done: false,
    finger: { x: 1200, y: 2100, pressT: -9, visible: false },
  };

  cc.rng = seed => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Sound events are logged for the offline mix and played live in the browser.
  let audio = null, lastLive = {};
  cc.sfx = (type, data = {}) => {
    cc.events.push({ t: +cc.time.toFixed(4), type, ...data });
    if (cc.recording) return;
    const now = performance.now();
    if (now - (lastLive[type] || 0) < 18) return;
    lastLive[type] = now;
    if (type === 'roll') return;
    try { livePlay(type, type === 'tock' ? { p: 0.9 } : data); } catch (e) { /* audio is optional */ }
  };

  function livePlay(type, data) {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const a = audio, t0 = a.currentTime;
    const g = a.createGain();
    g.connect(a.destination);
    if (type === 'click' || type === 'push' || type === 'drip' || type === 'select' || type === 'tock') {
      const o = a.createOscillator();
      const f = type === 'drip' ? 500 + 400 * (data.p || 0.5) : 1800 + 1400 * (data.p || 0.5);
      o.frequency.setValueAtTime(f, t0);
      if (type === 'drip') o.frequency.exponentialRampToValueAtTime(f * 1.8, t0 + 0.06);
      const v = type === 'push' ? 0.25 : 0.08;
      g.gain.setValueAtTime(v, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + (type === 'drip' ? 0.08 : 0.03));
      o.connect(g); o.start(t0); o.stop(t0 + 0.1);
    } else {
      const len = type === 'win' ? 0.6 : 0.15;
      const o = a.createOscillator();
      o.type = type === 'blocked' ? 'square' : 'sine';
      o.frequency.setValueAtTime(type === 'blocked' ? 140 : 660, t0);
      if (type !== 'blocked') o.frequency.exponentialRampToValueAtTime(1320, t0 + len);
      g.gain.setValueAtTime(0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
      o.connect(g); o.start(t0); o.stop(t0 + len);
    }
  }

  // Autoplay: each step moves the finger to target() and runs act() at time `at`.
  cc.script = steps => {
    const f = cc.finger;
    let i = 0, prevAt = 0, prevPos = [f.x, f.y];
    return t => {
      while (i < steps.length && t >= steps[i].at) {
        const s = steps[i];
        if (s.target) {
          const p = s.target();
          f.x = p[0]; f.y = p[1]; f.visible = true;
          if (s.press !== false) f.pressT = t;
          prevPos = p;
        }
        if (s.hide) f.visible = false;
        if (s.act) s.act();
        prevAt = s.at;
        i++;
      }
      const s = steps[i];
      if (s && s.target) {
        const p = s.target();
        const start = Math.max(prevAt + 0.15, s.at - 0.55);
        const k = Math.min(1, Math.max(0, (t - start) / (s.at - start)));
        const e = k * k * (3 - 2 * k);
        f.x = prevPos[0] + (p[0] - prevPos[0]) * e;
        f.y = prevPos[1] + (p[1] - prevPos[1]) * e;
        if (k > 0) f.visible = true;
      }
    };
  };

  cc.drawFinger = ctx => {
    const f = cc.finger;
    if (!f.visible) return;
    const dt = cc.time - f.pressT;
    if (dt >= 0 && dt < 0.45) {
      const k = dt / 0.45;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(f.x, f.y, 30 + 60 * k, 0, Math.PI * 2); ctx.stroke();
    }
    const r = dt >= 0 && dt < 0.12 ? 26 : 32;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,40,60,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
  };

  cc.toCanvas = (canvas, ev) => {
    // The picture keeps its 9:16 shape inside the element: on a taller screen it sits in
    // the middle with empty bands, so map from the picture, not from the element.
    const b = canvas.getBoundingClientRect(), sc = Math.min(b.width / cc.W, b.height / cc.H);
    return [(ev.clientX - b.left - (b.width - cc.W * sc) / 2) / sc, (ev.clientY - b.top - (b.height - cc.H * sc) / 2) / sc];
  };

  cc.run = ({ canvas, step, draw, autoplay }) => {
    const ctx = canvas.getContext('2d');
    const tick = () => {
      if (cc.auto && autoplay) autoplay(cc.time);
      step(cc.DT);
      cc.time += cc.DT;
    };
    if (cc.recording) {
      window.__frame = () => { tick(); draw(ctx); return canvas.toDataURL('image/png'); };
      window.__done = () => cc.done;
      window.__events = () => cc.events;
      return;
    }
    let last = performance.now(), acc = 0;
    const loop = now => {
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= cc.DT) { tick(); acc -= cc.DT; }
      draw(ctx);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  cc.roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  cc.star = (ctx, x, y, r) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  };

  cc.shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };

  cc.rgb = hex => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  return cc;
})();
