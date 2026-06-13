import { useState, useEffect, useRef, useCallback } from "react";

/* =====================================================
   SOMME TOUTE — prototype "grille équilibrée"
   Remplis les cases vides pour que chaque ligne et
   chaque colonne atteigne sa somme cible.
   Générateur garanti à solution unique.
   ===================================================== */

const DIFFS = {
  facile: { label: "Facile", size: 4, maxVal: 5, holes: 6 },
  moyen: { label: "Moyen", size: 5, maxVal: 7, holes: 9 },
  difficile: { label: "Difficile", size: 6, maxVal: 9, holes: 13 },
};

/* ---------- Génération ---------- */

const rnd = (n) => Math.floor(Math.random() * n);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Compte les solutions d'une grille partielle (s'arrête à 2). */
function countSolutions(puzzle, size, maxVal, rowT, colT) {
  const rowRem = [...rowT];
  const colRem = [...colT];
  const rowCnt = new Array(size).fill(0);
  const colCnt = new Array(size).fill(0);
  const empties = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = puzzle[r][c];
      if (v == null) {
        empties.push([r, c]);
        rowCnt[r]++;
        colCnt[c]++;
      } else {
        rowRem[r] -= v;
        colRem[c] -= v;
      }
    }
  }

  let count = 0;
  const dfs = (i) => {
    if (count >= 2) return;
    if (i === empties.length) {
      count++;
      return;
    }
    const [r, c] = empties[i];
    for (let v = 1; v <= maxVal; v++) {
      const rr = rowRem[r] - v;
      const cr = colRem[c] - v;
      const rn = rowCnt[r] - 1;
      const cn = colCnt[c] - 1;
      // Les cases restantes de la ligne/colonne doivent pouvoir
      // atteindre la somme restante avec des valeurs de 1 à maxVal.
      if (rr < rn || rr > rn * maxVal) continue;
      if (cr < cn || cr > cn * maxVal) continue;
      rowRem[r] = rr; colRem[c] = cr; rowCnt[r] = rn; colCnt[c] = cn;
      dfs(i + 1);
      rowRem[r] = rr + v; colRem[c] = cr + v; rowCnt[r] = rn + 1; colCnt[c] = cn + 1;
    }
  };
  dfs(0);
  return count;
}

/** Crée une grille pleine, calcule les cibles, puis retire des
    cases une à une en vérifiant que la solution reste unique. */
function generatePuzzle(diff) {
  const { size, maxVal, holes } = diff;
  const solution = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 1 + rnd(maxVal))
  );
  const rowT = solution.map((row) => row.reduce((a, b) => a + b, 0));
  const colT = Array.from({ length: size }, (_, c) =>
    solution.reduce((a, row) => a + row[c], 0)
  );

  const puzzle = solution.map((row) => [...row]);
  const order = shuffle(
    Array.from({ length: size * size }, (_, i) => [Math.floor(i / size), i % size])
  );

  let removed = 0;
  for (const [r, c] of order) {
    if (removed >= holes) break;
    const keep = puzzle[r][c];
    puzzle[r][c] = null;
    if (countSolutions(puzzle, size, maxVal, rowT, colT) === 1) {
      removed++;
    } else {
      puzzle[r][c] = keep;
    }
  }
  return { puzzle, solution, rowT, colT, size, maxVal };
}

/* ---------- Helpers UI ---------- */

const emptyEntries = (size) =>
  Array.from({ length: size }, () => new Array(size).fill(null));

const fmtTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* ---------- Composant ---------- */

export default function SommeToute() {
  const [diffKey, setDiffKey] = useState("facile");
  const [game, setGame] = useState(() => generatePuzzle(DIFFS.facile));
  const [entries, setEntries] = useState(() => emptyEntries(DIFFS.facile.size));
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | playing | won
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);

  const { puzzle, rowT, colT, size, maxVal } = game;

  const cellValue = useCallback(
    (r, c) => (puzzle[r][c] != null ? puzzle[r][c] : entries[r][c]),
    [puzzle, entries]
  );

  /* Timer */
  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      250
    );
    return () => clearInterval(id);
  }, [status]);

  /* Détection de victoire */
  useEffect(() => {
    if (status === "won") return;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) if (cellValue(r, c) == null) return;
    for (let r = 0; r < size; r++) {
      let s = 0;
      for (let c = 0; c < size; c++) s += cellValue(r, c);
      if (s !== rowT[r]) return;
    }
    for (let c = 0; c < size; c++) {
      let s = 0;
      for (let r = 0; r < size; r++) s += cellValue(r, c);
      if (s !== colT[c]) return;
    }
    setStatus("won");
    setSelected(null);
  }, [entries, status, size, rowT, colT, cellValue]);

  const newGame = useCallback((key) => {
    const d = DIFFS[key];
    setDiffKey(key);
    setGame(generatePuzzle(d));
    setEntries(emptyEntries(d.size));
    setSelected(null);
    setStatus("idle");
    setElapsed(0);
  }, []);

  const placeValue = useCallback(
    (v) => {
      if (status === "won" || !selected) return;
      const [r, c] = selected;
      if (puzzle[r][c] != null) return;
      setEntries((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = v;
        return next;
      });
      if (status === "idle") {
        startRef.current = Date.now();
        setStatus("playing");
      }
    },
    [status, selected, puzzle]
  );

  /* Clavier (desktop) */
  useEffect(() => {
    const onKey = (e) => {
      if (status === "won") return;
      const d = parseInt(e.key, 10);
      if (d >= 1 && d <= maxVal) placeValue(d);
      else if (e.key === "Backspace" || e.key === "Delete") placeValue(null);
      else if (e.key.startsWith("Arrow") && selected) {
        e.preventDefault();
        const [r, c] = selected;
        const dr = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
        const dc = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        setSelected([
          Math.min(size - 1, Math.max(0, r + dr)),
          Math.min(size - 1, Math.max(0, c + dc)),
        ]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, maxVal, selected, size, placeValue]);

  /* État des sommes : ok | over | pending */
  const rowState = (r) => {
    let s = 0, full = true;
    for (let c = 0; c < size; c++) {
      const v = cellValue(r, c);
      if (v == null) full = false;
      else s += v;
    }
    if (full) return s === rowT[r] ? "ok" : "over";
    return s > rowT[r] ? "over" : "pending";
  };
  const colState = (c) => {
    let s = 0, full = true;
    for (let r = 0; r < size; r++) {
      const v = cellValue(r, c);
      if (v == null) full = false;
      else s += v;
    }
    if (full) return s === colT[c] ? "ok" : "over";
    return s > colT[c] ? "over" : "pending";
  };

  return (
    <div className="st-root">
      <style>{CSS}</style>

      <header className="st-head">
        <div className="st-titlebox">
          <h1 className="st-title">Somme Toute</h1>
          <p className="st-sub">Équilibre chaque ligne et chaque colonne</p>
        </div>
        <div className="st-timer" aria-live="off">{fmtTime(elapsed)}</div>
      </header>

      <div className="st-bar">
        <div className="st-pills" role="tablist" aria-label="Difficulté">
          {Object.entries(DIFFS).map(([key, d]) => (
            <button
              key={key}
              role="tab"
              aria-selected={diffKey === key}
              className={`st-pill ${diffKey === key ? "active" : ""}`}
              onClick={() => newGame(key)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <button className="st-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
          ↻
        </button>
      </div>

      <div className="st-boardwrap">
        <div
          className="st-board"
          style={{ gridTemplateColumns: `repeat(${size}, var(--cell)) auto` }}
        >
          {Array.from({ length: size }).map((_, r) => (
            <FragmentRow
              key={r}
              r={r}
              size={size}
              puzzle={puzzle}
              entries={entries}
              selected={selected}
              setSelected={setSelected}
              rowT={rowT}
              rowState={rowState}
              won={status === "won"}
            />
          ))}
          {/* Ligne des cibles colonnes */}
          {Array.from({ length: size }).map((_, c) => (
            <div key={`ct${c}`} className={`st-chip col ${colState(c)}`}>
              {colT[c]}
            </div>
          ))}
          <div className="st-corner">Σ</div>
        </div>

        {status === "won" && (
          <div className="st-win" role="dialog" aria-label="Grille résolue">
            <div className="st-wincard">
              <div className="st-winmark">⚖️</div>
              <h2>Équilibré !</h2>
              <p className="st-wintime">{fmtTime(elapsed)}</p>
              <p className="st-windiff">{DIFFS[diffKey].label} · {size}×{size}</p>
              <button className="st-replay" onClick={() => newGame(diffKey)}>
                Rejouer
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="st-pad" aria-label="Pavé numérique">
        {Array.from({ length: maxVal }, (_, i) => i + 1).map((v) => (
          <button key={v} className="st-key" onClick={() => placeValue(v)}>
            {v}
          </button>
        ))}
        <button className="st-key erase" onClick={() => placeValue(null)} aria-label="Effacer">
          ⌫
        </button>
      </div>

      <p className="st-help">
        Touche une case vide puis choisis un nombre de 1 à {maxVal}.
        Les pastilles indiquent la somme cible de chaque ligne et colonne.
      </p>
    </div>
  );
}

/* Une ligne de la grille + sa pastille cible */
function FragmentRow({ r, size, puzzle, entries, selected, setSelected, rowT, rowState, won }) {
  return (
    <>
      {Array.from({ length: size }).map((_, c) => {
        const given = puzzle[r][c] != null;
        const v = given ? puzzle[r][c] : entries[r][c];
        const isSel = selected && selected[0] === r && selected[1] === c;
        const isPeer =
          selected && !isSel && (selected[0] === r || selected[1] === c);
        return (
          <button
            key={c}
            className={[
              "st-cell",
              given ? "given" : "entry",
              isSel ? "sel" : "",
              isPeer ? "peer" : "",
              won ? "wondone" : "",
            ].join(" ")}
            onClick={() => !given && setSelected([r, c])}
            aria-label={`Case ligne ${r + 1}, colonne ${c + 1}${v != null ? `, valeur ${v}` : ", vide"}`}
            disabled={won}
          >
            {v != null ? v : ""}
          </button>
        );
      })}
      <div className={`st-chip row ${rowState(r)}`}>{rowT[r]}</div>
    </>
  );
}

/* ---------- Styles ---------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Space+Grotesk:wght@400;500;700&display=swap');

.st-root {
  --bg: #F1F6EF;
  --ink: #1C3B33;
  --ink-soft: #557068;
  --teal: #0E7C66;
  --accent: #FFAD33;
  --ok: #3D9A67;
  --bad: #DD5B4F;
  --cellbg: #FFFFFF;
  --givenbg: #E4EEE3;
  --cell: clamp(42px, 11.5vw, 58px);

  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: 'Space Grotesk', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px 36px;
  box-sizing: border-box;
}

.st-head {
  width: 100%;
  max-width: 460px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.st-title {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800;
  font-size: clamp(26px, 7vw, 34px);
  margin: 0;
  letter-spacing: -0.02em;
}
.st-sub {
  margin: 2px 0 0;
  color: var(--ink-soft);
  font-size: 13px;
}
.st-timer {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 18px;
  background: var(--ink);
  color: #fff;
  border-radius: 999px;
  padding: 6px 14px;
  margin-top: 4px;
}

.st-bar {
  width: 100%;
  max-width: 460px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 18px;
}
.st-pills { display: flex; gap: 6px; }
.st-pill {
  border: 1.5px solid var(--ink);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
}
.st-pill.active { background: var(--ink); color: #fff; }
.st-new {
  border: none;
  background: var(--accent);
  color: var(--ink);
  font-size: 18px;
  width: 38px; height: 38px;
  border-radius: 50%;
  cursor: pointer;
  font-weight: 700;
}

.st-boardwrap { position: relative; }
.st-board {
  display: grid;
  gap: 6px;
  align-items: center;
  justify-items: center;
}

.st-cell {
  width: var(--cell);
  height: var(--cell);
  border-radius: 12px;
  border: 1.5px solid transparent;
  background: var(--cellbg);
  box-shadow: 0 1px 0 rgba(28,59,51,0.12);
  font: inherit;
  font-weight: 700;
  font-size: calc(var(--cell) * 0.42);
  color: var(--teal);
  cursor: pointer;
  transition: transform 0.08s ease, border-color 0.08s ease, background 0.08s ease;
}
.st-cell.given {
  background: var(--givenbg);
  color: var(--ink);
  cursor: default;
  box-shadow: none;
}
.st-cell.entry.peer { background: #FBFDF7; border-color: #CFE0CF; }
.st-cell.entry.sel {
  border-color: var(--accent);
  background: #FFF6E3;
  transform: scale(1.04);
}
.st-cell.wondone { color: var(--ok); }

.st-chip {
  min-width: calc(var(--cell) * 0.66);
  padding: 0 8px;
  height: calc(var(--cell) * 0.58);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  font-weight: 700;
  font-size: calc(var(--cell) * 0.3);
  font-variant-numeric: tabular-nums;
  transition: background 0.15s ease, transform 0.15s ease;
}
.st-chip.ok { background: var(--ok); animation: st-pop 0.3s ease; }
.st-chip.over { background: var(--bad); }
.st-corner {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800;
  color: var(--ink-soft);
  font-size: calc(var(--cell) * 0.34);
}

@keyframes st-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.18); }
  100% { transform: scale(1); }
}

.st-pad {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 22px;
  max-width: 460px;
}
.st-key {
  width: clamp(44px, 12vw, 56px);
  height: clamp(44px, 12vw, 56px);
  border-radius: 14px;
  border: 1.5px solid var(--ink);
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  font-size: 20px;
  cursor: pointer;
}
.st-key:active { background: var(--accent); }
.st-key.erase { background: var(--givenbg); }

.st-help {
  max-width: 380px;
  text-align: center;
  color: var(--ink-soft);
  font-size: 12.5px;
  line-height: 1.5;
  margin-top: 18px;
}

.st-win {
  position: absolute;
  inset: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(241,246,239,0.82);
  backdrop-filter: blur(2px);
  border-radius: 16px;
  animation: st-fade 0.25s ease;
}
.st-wincard {
  background: #fff;
  border: 2px solid var(--ink);
  border-radius: 20px;
  padding: 26px 34px;
  text-align: center;
  box-shadow: 6px 6px 0 var(--accent);
}
.st-wincard h2 {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800;
  margin: 6px 0 2px;
  font-size: 24px;
}
.st-winmark { font-size: 30px; }
.st-wintime {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin: 4px 0 0;
  color: var(--teal);
}
.st-windiff { color: var(--ink-soft); font-size: 13px; margin: 2px 0 14px; }
.st-replay {
  border: none;
  background: var(--ink);
  color: #fff;
  font: inherit;
  font-weight: 700;
  font-size: 15px;
  border-radius: 999px;
  padding: 10px 26px;
  cursor: pointer;
}

@keyframes st-fade { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .st-cell, .st-chip, .st-win { transition: none; animation: none; }
}
`;
