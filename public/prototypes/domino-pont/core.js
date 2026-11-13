// Rules of the domino bridge puzzle: the levels, their single solution, how placed tiles match.
// A gap in the course is a row of empty places between two fixed numbers. A tile fills one place; the gap
// holds when every tile touches its neighbours by the same number, as in the game of dominoes.
const BR = (() => {
  const rng = seed => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // rows: the gap lengths of each row of the course, from the bottom. lo, hi: the numbers in play.
  // spare: tiles of the hand that go nowhere. traps: wrong ways to fill a gap that the hand must offer.
  const SPECS = [
    { rows: [[], [1]], lo: 1, hi: 3, spare: 1, traps: 0 },
    { rows: [[1], [1]], lo: 1, hi: 4, spare: 1, traps: 0 },
    { rows: [[], [2]], lo: 1, hi: 4, spare: 1, traps: 0 },
    { rows: [[1], [2]], lo: 1, hi: 4, spare: 1, traps: 1 },
    { rows: [[2], [2]], lo: 1, hi: 4, spare: 1, traps: 1 },
    { rows: [[1, 1], [2]], lo: 1, hi: 5, spare: 1, traps: 1 },
    { rows: [[], [3]], lo: 1, hi: 5, spare: 2, traps: 0 },
    { rows: [[2], [3]], lo: 1, hi: 5, spare: 1, traps: 2 },
    { rows: [[1], [2], [2]], lo: 1, hi: 5, spare: 1, traps: 2 },
    { rows: [[3], [3]], lo: 1, hi: 5, spare: 1, traps: 2 },
    { rows: [[1, 1], [3]], lo: 0, hi: 5, spare: 2, traps: 2 },
    { rows: [[2], [2], [2]], lo: 0, hi: 5, spare: 2, traps: 3 },
    { rows: [[1], [2], [3]], lo: 0, hi: 5, spare: 2, traps: 3 },
    { rows: [[3], [1, 1], [2]], lo: 0, hi: 5, spare: 2, traps: 3 },
    { rows: [[2], [3], [3]], lo: 0, hi: 5, spare: 1, traps: 4 },
    { rows: [[1, 1], [2], [3]], lo: 0, hi: 6, spare: 2, traps: 4 },
    { rows: [[3], [3], [2]], lo: 0, hi: 6, spare: 2, traps: 4 },
    { rows: [[1], [2], [2], [2]], lo: 0, hi: 6, spare: 2, traps: 4 },
    { rows: [[3], [3], [3]], lo: 0, hi: 6, spare: 1, traps: 5 },
    { rows: [[2], [2], [3], [1]], lo: 0, hi: 6, spare: 2, traps: 5 },
    { rows: [[1, 1], [3], [3]], lo: 0, hi: 5, spare: 2, traps: 6 },
    { rows: [[2], [3], [1], [3]], lo: 0, hi: 5, spare: 1, traps: 6 },
    { rows: [[3], [2], [3], [2]], lo: 0, hi: 5, spare: 0, traps: 7 },
    { rows: [[3], [3], [3], [1]], lo: 0, hi: 4, spare: 0, traps: 8 },
  ];

  // Live levels, where the wave runs while the player fills: many short gaps, quick to read.
  const LIVE = [
    { rows: [[], [1]], lo: 1, hi: 3, spare: 1, traps: 0 },
    { rows: [[1], [1]], lo: 1, hi: 4, spare: 1, traps: 0 },
    { rows: [[1], [1, 1]], lo: 1, hi: 4, spare: 1, traps: 0 },
    { rows: [[1, 1], [1, 1]], lo: 1, hi: 4, spare: 1, traps: 0 },
    { rows: [[1], [2]], lo: 1, hi: 4, spare: 1, traps: 1 },
    { rows: [[1, 1], [2]], lo: 1, hi: 5, spare: 1, traps: 1 },
    { rows: [[1, 1], [1, 1], [1]], lo: 1, hi: 5, spare: 1, traps: 0 },
    { rows: [[2], [1, 1], [1]], lo: 1, hi: 5, spare: 2, traps: 1 },
    { rows: [[1, 1], [2], [1, 1]], lo: 1, hi: 5, spare: 1, traps: 1 },
    { rows: [[2], [2], [1, 1]], lo: 0, hi: 5, spare: 2, traps: 2 },
    { rows: [[1, 1], [1, 1], [1, 1]], lo: 0, hi: 5, spare: 2, traps: 0 },
    { rows: [[2], [1, 1], [2]], lo: 0, hi: 5, spare: 2, traps: 2 },
    { rows: [[1, 1], [2], [2]], lo: 0, hi: 5, spare: 2, traps: 2 },
    { rows: [[2], [2], [2]], lo: 0, hi: 5, spare: 2, traps: 3 },
    { rows: [[1, 1], [1, 1], [2], [1]], lo: 0, hi: 6, spare: 2, traps: 1 },
    { rows: [[2], [1, 1], [2], [1, 1]], lo: 0, hi: 6, spare: 2, traps: 2 },
    { rows: [[1, 1], [2], [1, 1], [2]], lo: 0, hi: 6, spare: 2, traps: 2 },
    { rows: [[3], [1, 1], [2]], lo: 0, hi: 6, spare: 2, traps: 2 },
    { rows: [[2], [2], [2], [1, 1]], lo: 0, hi: 6, spare: 2, traps: 3 },
    { rows: [[1, 1], [3], [1, 1], [1]], lo: 0, hi: 6, spare: 2, traps: 2 },
    { rows: [[2], [3], [2], [1]], lo: 0, hi: 5, spare: 2, traps: 3 },
    { rows: [[1, 1], [2], [3], [1, 1]], lo: 0, hi: 5, spare: 1, traps: 3 },
    { rows: [[3], [2], [2], [2]], lo: 0, hi: 5, spare: 1, traps: 4 },
    { rows: [[3], [2], [3], [1, 1]], lo: 0, hi: 5, spare: 0, traps: 4 },
  ];

  // Every set of hand tiles that fills a gap alone, each as a bit mask of hand places.
  function fillings(gap, hand) {
    const found = new Set();
    const go = (pos, value, used) => {
      for (let k = 0; k < hand.length; k++) {
        if (used & (1 << k)) continue;
        const [x, y] = hand[k];
        if (x !== value && y !== value) continue;
        const next = x === value ? y : x;
        if (pos === gap.n - 1) { if (next === gap.b) found.add(used | (1 << k)); }
        else go(pos + 1, next, used | (1 << k));
      }
    };
    go(0, gap.a, 0);
    return [...found];
  }

  // How many ways the hand fills every gap at once, and how many wrong fillings tempt.
  function count(gaps, hand) {
    const each = gaps.map(g => fillings(g, hand));
    let ways = 0;
    const go = (k, used) => {
      if (k === gaps.length) { ways++; return; }
      for (const m of each[k]) if (!(m & used)) go(k + 1, used | m);
    };
    go(0, 0);
    return { ways, traps: each.reduce((s, e) => s + e.length, 0) - gaps.length };
  }

  // One way to fill every gap: for each gap, its tiles in order, each turned the way it lies.
  function solve(gaps, hand) {
    const chain = (gap, mask) => {
      let out = null;
      const go = (pos, value, used, acc) => {
        if (out) return;
        for (let k = 0; k < hand.length && !out; k++) {
          if (!(mask & (1 << k)) || used & (1 << k)) continue;
          const [x, y] = hand[k];
          if (x !== value && y !== value) continue;
          const next = x === value ? y : x, step = acc.concat([{ k, l: value, r: next }]);
          if (pos === gap.n - 1) { if (next === gap.b) out = step; }
          else go(pos + 1, next, used | (1 << k), step);
        }
      };
      go(0, gap.a, 0, []);
      return out;
    };
    const each = gaps.map(g => fillings(g, hand));
    let picked = null;
    const go = (k, used, acc) => {
      if (picked) return;
      if (k === gaps.length) { picked = acc; return; }
      for (const m of each[k]) if (!(m & used)) go(k + 1, used | m, acc.concat([m]));
    };
    go(0, 0, []);
    return picked && picked.map((m, k) => chain(gaps[k], m));
  }

  // Level n (from 0) of the calm or the live set: its gaps, row by row, and the hand. Always the same for a given n.
  function make(n, live = false) {
    const spec = (live ? LIVE : SPECS)[n];
    for (let attempt = 0; attempt < 20000; attempt++) {
      const rand = rng(7919 * (n + 1 + (live ? 500 : 0)) + attempt * 104729), pick = m => Math.floor(rand() * m);
      const all = [];
      for (let i = spec.lo; i <= spec.hi; i++) for (let j = i; j <= spec.hi; j++) all.push([i, j]);
      const free = all.map(() => true), hand = [], gaps = [];
      let ok = true;
      spec.rows.forEach((row, r) => row.forEach(len => {
        const gap = { row: r, n: len, a: spec.lo + pick(spec.hi - spec.lo + 1) };
        let value = gap.a;
        for (let i = 0; i < len && ok; i++) {
          const fit = all.map((t, k) => k).filter(k => free[k] && (all[k][0] === value || all[k][1] === value));
          if (!fit.length) { ok = false; break; }
          const k = fit[pick(fit.length)];
          free[k] = false; hand.push(all[k]);
          value = all[k][0] === value ? all[k][1] : all[k][0];
        }
        gap.b = value;
        gaps.push(gap);
      }));
      if (!ok) continue;
      // A gap between two equal numbers reads as nothing to do: keep them rare.
      if (gaps.some(g => g.a === g.b && g.n === 1)) continue;
      // Spare tiles carry a number of a gap's end, so that they tempt.
      const ends = new Set(gaps.flatMap(g => [g.a, g.b]));
      for (let s = 0; s < spec.spare; s++) {
        const left = all.map((t, k) => k).filter(k => free[k] && (ends.has(all[k][0]) || ends.has(all[k][1])));
        if (!left.length) { ok = false; break; }
        const k = left[pick(left.length)];
        free[k] = false; hand.push(all[k]);
      }
      if (!ok) continue;
      for (let i = hand.length - 1; i > 0; i--) { const j = pick(i + 1); [hand[i], hand[j]] = [hand[j], hand[i]]; }
      const c = count(gaps, hand);
      if (c.ways !== 1 || c.traps < spec.traps) continue;
      return { n, rows: spec.rows.length, gaps, hand, traps: c.traps, attempt };
    }
    return null;
  }

  // The tiles of a gap as they lie: each placed tile is turned so that the most joints match.
  // tiles: one [x, y] or null for each place. Returns each tile as [left, right] and the state of the
  // n + 1 joints: 'ok', 'bad', or 'open' beside an empty place.
  function lay(gap, tiles) {
    const placed = tiles.map((t, i) => t ? i : -1).filter(i => i >= 0);
    let best = null;
    for (let flips = 0; flips < 1 << placed.length; flips++) {
      const vals = tiles.map(() => null);
      placed.forEach((i, k) => { const [x, y] = tiles[i]; vals[i] = flips & (1 << k) ? [y, x] : [x, y]; });
      const joints = [];
      for (let j = 0; j <= gap.n; j++) {
        const left = j === 0 ? gap.a : vals[j - 1] && vals[j - 1][1], right = j === gap.n ? gap.b : vals[j] && vals[j][0];
        joints.push(left == null || right == null ? 'open' : left === right ? 'ok' : 'bad');
      }
      const score = joints.filter(s => s === 'ok').length;
      if (!best || score > best.score) best = { vals, joints, score };
    }
    return best;
  }

  return { SPECS, LIVE, make, count, solve, lay, fillings, rng };
})();
if (typeof module !== 'undefined') module.exports = BR;
