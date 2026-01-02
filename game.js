/* Block Blast-style (vanilla JS) */

const GRID_SIZE = 7;
const PIECES_PER_ROUND = 3;
const BEST_KEY = "blockBlastBestScoreV1";

const boardEl = document.getElementById("board");
const piecesEl = document.getElementById("pieces");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const newGameBtn = document.getElementById("newGameBtn");
const playAgainBtn = document.getElementById("playAgainBtn");
const modalEl = document.getElementById("gameOverModal");
const dragLayerEl = document.getElementById("dragLayer");

/** @type {(string|null)[][]} per-cell fill color */
let board = [];
/** @type {ReturnType<typeof makePiece>[]} */
let hand = [];

let score = 0;
let bestScore = Number(localStorage.getItem(BEST_KEY) || "0") || 0;
let combo = 0;

/** Drag state */
let dragging = null; // { pieceIdx, piece, pointerId }
let ghost = null; // { ok, cells: Array<{x,y}> }

function randInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function makeEmptyBoard() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

function cellsForShape(shape) {
  // shape: array of [x,y]
  return shape.map(([x, y]) => ({ x, y }));
}

function bounds(cells) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function normalizeCells(cells) {
  const b = bounds(cells);
  return cells.map((c) => ({ x: c.x - b.minX, y: c.y - b.minY }));
}

function colorForSize(size) {
  // A small palette, mapped by size for variety.
  const palette = [
    "rgba(140, 200, 255, 0.85)",
    "rgba(150, 255, 200, 0.82)",
    "rgba(255, 190, 140, 0.82)",
    "rgba(210, 170, 255, 0.82)",
    "rgba(255, 150, 200, 0.82)",
    "rgba(255, 235, 140, 0.82)",
  ];
  return palette[size % palette.length];
}

function shapesCatalog() {
  // Coordinates are relative; we normalize before use.
  // Includes common Block Blast pieces (no rotation controls; variants are listed explicitly).
  const s = (coords) => normalizeCells(cellsForShape(coords));

  return [
    // singles / lines
    s([[0, 0]]),
    s([[0, 0], [1, 0]]),
    s([[0, 0], [1, 0], [2, 0]]),
    s([[0, 0], [1, 0], [2, 0], [3, 0]]),
    s([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]),
    s([[0, 0], [0, 1]]),
    s([[0, 0], [0, 1], [0, 2]]),
    s([[0, 0], [0, 1], [0, 2], [0, 3]]),
    s([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]),

    // squares / rectangles
    s([[0, 0], [1, 0], [0, 1], [1, 1]]),
    s([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]), // 3x2
    s([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]), // 2x3
    s([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]), // 3x3

    // L (3 blocks)
    s([[0, 0], [0, 1], [1, 1]]),
    s([[1, 0], [0, 1], [1, 1]]),
    s([[0, 0], [1, 0], [0, 1]]),
    s([[0, 0], [1, 0], [1, 1]]),

    // L (4 blocks)
    s([[0, 0], [0, 1], [0, 2], [1, 2]]),
    s([[1, 0], [1, 1], [1, 2], [0, 2]]),
    s([[0, 0], [1, 0], [2, 0], [2, 1]]),
    s([[0, 0], [1, 0], [2, 0], [0, 1]]),
    s([[0, 0], [0, 1], [1, 0], [2, 0]]), // step-ish

    // T (4/5)
    s([[0, 0], [1, 0], [2, 0], [1, 1]]),
    s([[1, 0], [0, 1], [1, 1], [1, 2]]),
    s([[1, 0], [0, 1], [1, 1], [2, 1]]),
    s([[0, 1], [1, 1], [2, 1], [1, 0]]),
    s([[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]]), // tall T

    // Z / S (4)
    s([[0, 0], [1, 0], [1, 1], [2, 1]]),
    s([[1, 0], [2, 0], [0, 1], [1, 1]]),
    s([[0, 0], [0, 1], [1, 1], [1, 2]]),
    s([[1, 0], [0, 1], [1, 1], [0, 2]]),

    // plus (5)
    s([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]),

    // corner 3x3 minus corners-ish (5)
    s([[0, 0], [1, 0], [0, 1], [0, 2], [1, 2]]),
    s([[2, 0], [1, 0], [2, 1], [2, 2], [1, 2]]),
  ];
}

const SHAPES = shapesCatalog();

function makePiece() {
  const shape = SHAPES[randInt(SHAPES.length)];
  const size = shape.length;
  const b = bounds(shape);
  return {
    id: Math.random().toString(16).slice(2),
    shape, // normalized cells
    size,
    color: colorForSize(size),
    bounds: b,
  };
}

function setScore(next) {
  score = next;
  scoreEl.textContent = String(score);
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(BEST_KEY, String(bestScore));
  }
  bestScoreEl.textContent = String(bestScore);
}

function showGameOver(show) {
  modalEl.classList.toggle("show", show);
  modalEl.setAttribute("aria-hidden", show ? "false" : "true");
}

function initBoardDom() {
  boardEl.style.setProperty("--grid-size", String(GRID_SIZE));
  boardEl.innerHTML = "";
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      boardEl.appendChild(cell);
    }
  }
}

function renderBoard() {
  const cells = boardEl.querySelectorAll(".cell");
  for (const el of cells) {
    const x = Number(el.dataset.x);
    const y = Number(el.dataset.y);
    const fill = board[y][x];
    const filled = fill !== null;
    el.classList.toggle("filled", filled);
    if (filled) {
      el.style.setProperty("--fill", fill);
    } else {
      el.style.removeProperty("--fill");
    }
  }
}

function clearGhost() {
  ghost = null;
  const cells = boardEl.querySelectorAll(".cell.ghost-ok, .cell.ghost-bad");
  for (const el of cells) {
    el.classList.remove("ghost-ok", "ghost-bad");
  }
}

function drawGhost(cells, ok) {
  clearGhost();
  ghost = { cells, ok };
  for (const c of cells) {
    const sel = `.cell[data-x="${c.x}"][data-y="${c.y}"]`;
    const el = boardEl.querySelector(sel);
    if (el) el.classList.add(ok ? "ghost-ok" : "ghost-bad");
  }
}

function renderHand() {
  piecesEl.innerHTML = "";
  for (let i = 0; i < PIECES_PER_ROUND; i++) {
    const slot = document.createElement("div");
    slot.className = "piece-slot";
    slot.dataset.idx = String(i);

    const piece = hand[i];
    if (!piece) {
      slot.classList.add("empty");
      slot.textContent = "—";
      piecesEl.appendChild(slot);
      continue;
    }

    const b = bounds(piece.shape);
    const grid = document.createElement("div");
    grid.className = "piece";
    grid.style.gridTemplateColumns = `repeat(${b.w}, 18px)`;
    grid.style.gridTemplateRows = `repeat(${b.h}, 18px)`;
    grid.style.setProperty("--fill", piece.color);
    grid.dataset.pieceId = piece.id;

    // quick lookup
    const on = new Set(piece.shape.map((c) => `${c.x},${c.y}`));
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const pcell = document.createElement("div");
        pcell.className = "pcell" + (on.has(`${x},${y}`) ? " on" : "");
        if (on.has(`${x},${y}`)) pcell.style.setProperty("--fill", piece.color);
        grid.appendChild(pcell);
      }
    }

    slot.appendChild(grid);
    piecesEl.appendChild(slot);
  }
}

function canPlace(piece, originX, originY) {
  for (const c of piece.shape) {
    const x = originX + c.x;
    const y = originY + c.y;
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
    if (board[y][x] !== null) return false;
  }
  return true;
}

function placePiece(piece, originX, originY) {
  for (const c of piece.shape) {
    const x = originX + c.x;
    const y = originY + c.y;
    board[y][x] = piece.color;
  }
}

function clearFullLines() {
  const rows = [];
  const cols = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    let full = true;
    for (let x = 0; x < GRID_SIZE; x++) {
      if (board[y][x] === null) {
        full = false;
        break;
      }
    }
    if (full) rows.push(y);
  }

  for (let x = 0; x < GRID_SIZE; x++) {
    let full = true;
    for (let y = 0; y < GRID_SIZE; y++) {
      if (board[y][x] === null) {
        full = false;
        break;
      }
    }
    if (full) cols.push(x);
  }

  if (rows.length === 0 && cols.length === 0) return { rows: 0, cols: 0, cells: 0 };

  // Clear union of cells (rows + cols)
  const toClear = new Set();
  for (const y of rows) for (let x = 0; x < GRID_SIZE; x++) toClear.add(`${x},${y}`);
  for (const x of cols) for (let y = 0; y < GRID_SIZE; y++) toClear.add(`${x},${y}`);

  for (const key of toClear) {
    const [xStr, yStr] = key.split(",");
    const x = Number(xStr);
    const y = Number(yStr);
    board[y][x] = null;
  }

  return { rows: rows.length, cols: cols.length, cells: toClear.size };
}

function anyMovesAvailable() {
  for (const piece of hand) {
    if (!piece) continue;
    // Try every origin cell (top-left) quickly.
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (canPlace(piece, x, y)) return true;
      }
    }
  }
  return false;
}

function maybeDealNewHand() {
  const remaining = hand.filter(Boolean).length;
  if (remaining === 0) {
    hand = Array.from({ length: PIECES_PER_ROUND }, () => makePiece());
    renderHand();
  }
}

function startNewGame() {
  board = makeEmptyBoard();
  hand = Array.from({ length: PIECES_PER_ROUND }, () => makePiece());
  combo = 0;
  setScore(0);
  showGameOver(false);
  clearGhost();
  renderBoard();
  renderHand();
}

function boardCellFromPointer(clientX, clientY) {
  const rect = boardEl.getBoundingClientRect();
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  )
    return null;

  const styles = getComputedStyle(boardEl);
  const padL = parseFloat(styles.paddingLeft) || 0;
  const padR = parseFloat(styles.paddingRight) || 0;
  const padT = parseFloat(styles.paddingTop) || 0;
  const padB = parseFloat(styles.paddingBottom) || 0;

  const innerW = Math.max(1, rect.width - padL - padR);
  const innerH = Math.max(1, rect.height - padT - padB);

  const relX = clientX - rect.left - padL;
  const relY = clientY - rect.top - padT;

  const cellW = innerW / GRID_SIZE;
  const cellH = innerH / GRID_SIZE;

  const x = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(relX / cellW)));
  const y = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(relY / cellH)));
  return { x, y };
}

function nearestValidOrigin(piece, desiredOriginX, desiredOriginY) {
  const b = piece.bounds || bounds(piece.shape);
  const minX = 0;
  const minY = 0;
  const maxX = GRID_SIZE - b.w;
  const maxY = GRID_SIZE - b.h;

  const startX = Math.max(minX, Math.min(maxX, desiredOriginX));
  const startY = Math.max(minY, Math.min(maxY, desiredOriginY));

  if (canPlace(piece, startX, startY)) return { x: startX, y: startY, ok: true };

  // BFS (manhattan) to find closest valid origin.
  const key = (x, y) => `${x},${y}`;
  const q = [{ x: startX, y: startY }];
  const seen = new Set([key(startX, startY)]);
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  while (q.length) {
    const cur = q.shift();
    for (const d of dirs) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      if (canPlace(piece, nx, ny)) return { x: nx, y: ny, ok: true };
      q.push({ x: nx, y: ny });
    }
  }

  return { x: startX, y: startY, ok: false };
}

function ghostForPointer(piece, clientX, clientY) {
  const pos = boardCellFromPointer(clientX, clientY);
  if (!pos) return null;
  // Align shape's top-left to hovered cell.
  const snapped = nearestValidOrigin(piece, pos.x, pos.y);
  const originX = snapped.x;
  const originY = snapped.y;
  const cells = piece.shape.map((c) => ({ x: originX + c.x, y: originY + c.y }));
  const ok = snapped.ok;
  // If out of bounds, canPlace already false, but filter to visible cells for highlighting.
  const visible = cells.filter(
    (c) => c.x >= 0 && c.x < GRID_SIZE && c.y >= 0 && c.y < GRID_SIZE,
  );
  return { ok, originX, originY, cells: visible, rawCells: cells };
}

function makeDragGhostEl(piece) {
  const b = bounds(piece.shape);
  const el = document.createElement("div");
  el.className = "drag-ghost piece";
  el.style.gridTemplateColumns = `repeat(${b.w}, 22px)`;
  el.style.gridTemplateRows = `repeat(${b.h}, 22px)`;
  el.style.setProperty("--fill", piece.color);

  const on = new Set(piece.shape.map((c) => `${c.x},${c.y}`));
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const pcell = document.createElement("div");
      pcell.className = "pcell" + (on.has(`${x},${y}`) ? " on" : "");
      pcell.style.width = "22px";
      pcell.style.height = "22px";
      if (on.has(`${x},${y}`)) pcell.style.setProperty("--fill", piece.color);
      el.appendChild(pcell);
    }
  }
  return el;
}

function onPointerDownPiece(e) {
  const slot = e.target.closest(".piece-slot");
  if (!slot) return;
  const idx = Number(slot.dataset.idx);
  const piece = hand[idx];
  if (!piece) return;
  if (modalEl.classList.contains("show")) return;

  e.preventDefault();
  clearGhost();

  const dragEl = makeDragGhostEl(piece);
  dragLayerEl.appendChild(dragEl);
  dragLayerEl.setAttribute("aria-hidden", "false");
  dragEl.style.left = `${e.clientX}px`;
  dragEl.style.top = `${e.clientY}px`;

  dragging = { pieceIdx: idx, piece, pointerId: e.pointerId, dragEl };
  document.addEventListener("pointermove", onPointerMove, { passive: false });
  document.addEventListener("pointerup", onPointerUp, { passive: false });
}

function onPointerMove(e) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  e.preventDefault();
  dragging.dragEl.style.left = `${e.clientX}px`;
  dragging.dragEl.style.top = `${e.clientY}px`;

  const g = ghostForPointer(dragging.piece, e.clientX, e.clientY);
  if (!g) {
    clearGhost();
    return;
  }
  drawGhost(g.cells, g.ok);
}

function onPointerUp(e) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  e.preventDefault();

  const handIdx = dragging.pieceIdx;
  const piece = dragging.piece;
  const g = ghostForPointer(piece, e.clientX, e.clientY);
  const can = g && canPlace(piece, g.originX, g.originY);

  // Cleanup drag UI
  dragging.dragEl.remove();
  dragLayerEl.setAttribute("aria-hidden", "true");
  dragging = null;
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);

  if (!g) {
    clearGhost();
    return;
  }

  if (!can) {
    clearGhost();
    return;
  }

  // Place + score
  placePiece(piece, g.originX, g.originY);
  hand[handIdx] = null;

  // Base points: blocks placed
  let delta = piece.size;

  const cleared = clearFullLines();
  const lines = cleared.rows + cleared.cols;
  if (lines > 0) {
    combo += 1;
    // Lines are worth more; combo multiplies gently
    delta += Math.round((lines * 100 + cleared.cells * 2) * (1 + Math.min(combo - 1, 6) * 0.15));
  } else {
    combo = 0;
  }

  setScore(score + delta);
  renderBoard();
  clearGhost();

  maybeDealNewHand();
  renderHand();

  if (!anyMovesAvailable()) {
    showGameOver(true);
  }
}

function wireEvents() {
  piecesEl.addEventListener("pointerdown", onPointerDownPiece, { passive: false });
  newGameBtn.addEventListener("click", startNewGame);
  playAgainBtn.addEventListener("click", startNewGame);
  modalEl.addEventListener("click", (e) => {
    // click outside card closes -> start new (quick loop)
    if (e.target === modalEl) startNewGame();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl.classList.contains("show")) startNewGame();
  });
}

function main() {
  bestScoreEl.textContent = String(bestScore);
  initBoardDom();
  wireEvents();
  startNewGame();
}

main();

