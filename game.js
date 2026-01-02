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
const flamesOverlayEl = document.getElementById("flamesOverlay");

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
let isAnimating = false;

/** @type {HTMLElement[][]} */
let cellEls = [];

function randInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function makeEmptyBoard() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

function randomFillColor() {
  // Reuse the piece palette for consistency.
  return colorForSize(randInt(6) + 1);
}

function seedBoardRandomBlocks(targetCount = Math.max(6, GRID_SIZE)) {
  const rowCounts = Array(GRID_SIZE).fill(0);
  const colCounts = Array(GRID_SIZE).fill(0);

  // Count current fills (should be empty on new game, but keep it robust).
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (board[y][x] !== null) {
        rowCounts[y] += 1;
        colCounts[x] += 1;
      }
    }
  }

  const maxPerLine = GRID_SIZE - 1; // avoid starting with an instant clear
  let placed = 0;
  let attempts = 0;
  const maxAttempts = 800;

  while (placed < targetCount && attempts < maxAttempts) {
    attempts += 1;
    const x = randInt(GRID_SIZE);
    const y = randInt(GRID_SIZE);
    if (board[y][x] !== null) continue;
    if (rowCounts[y] >= maxPerLine) continue;
    if (colCounts[x] >= maxPerLine) continue;

    board[y][x] = randomFillColor();
    rowCounts[y] += 1;
    colCounts[x] += 1;
    placed += 1;
  }
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
  const prev = score;
  score = next;

  // Check for flame effects based on score increase
  if (prev > 0) {
    const ratio = score / prev;
    if (ratio >= 3) {
      // Triple score or more - screen takeover flames
      triggerFlameEffect(true);
    } else if (ratio >= 2) {
      // Double score - regular flames
      triggerFlameEffect(false);
    }
  }

  if (score > prev) {
    // Animate score counting up
    const diff = score - prev;
    let increment;

    if (diff >= 1000) {
      increment = 10;
    } else if (diff >= 100) {
      increment = 5;
    } else {
      increment = 1;
    }

    let currentScore = prev;
    const intervalId = setInterval(() => {
      currentScore += increment;
      if (currentScore >= score) {
        currentScore = score;
        clearInterval(intervalId);
      }
      scoreEl.textContent = String(currentScore);

      // Add bump animation on each increment
      scoreEl.classList.remove("bump");
      // eslint-disable-next-line no-unused-expressions
      scoreEl.offsetWidth;
      scoreEl.classList.add("bump");
    }, 50);
  } else {
    scoreEl.textContent = String(score);
  }

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(BEST_KEY, String(bestScore));
  }
  bestScoreEl.textContent = String(bestScore);
}

function triggerFlameEffect(screenTakeover = false) {
  // Clear any existing flame effects
  flamesOverlayEl.classList.remove("active", "screen-takeover");

  // Force reflow to restart animation
  // eslint-disable-next-line no-unused-expressions
  flamesOverlayEl.offsetWidth;

  if (screenTakeover) {
    flamesOverlayEl.classList.add("screen-takeover");
    // Remove after animation completes
    setTimeout(() => {
      flamesOverlayEl.classList.remove("screen-takeover");
    }, 3000); // 3 seconds for screen takeover
  } else {
    flamesOverlayEl.classList.add("active");
    // Remove after animation completes
    setTimeout(() => {
      flamesOverlayEl.classList.remove("active");
    }, 1500); // 1.5 seconds for regular flames
  }
}

function showGameOver(show) {
  modalEl.classList.toggle("show", show);
  modalEl.setAttribute("aria-hidden", show ? "false" : "true");
}

function initBoardDom() {
  boardEl.style.setProperty("--grid-size", String(GRID_SIZE));
  boardEl.innerHTML = "";
  cellEls = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      boardEl.appendChild(cell);
      row.push(cell);
    }
    cellEls.push(row);
  }
}

function renderBoard() {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const el = cellEls[y][x];
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
    const el = cellEls[c.y]?.[c.x];
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
    grid.style.gridTemplateColumns = `repeat(${b.w}, var(--piece-cell, 18px))`;
    grid.style.gridTemplateRows = `repeat(${b.h}, var(--piece-cell, 18px))`;
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

function computeFullLines() {
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

  if (rows.length === 0 && cols.length === 0)
    return { rows: 0, cols: 0, cells: 0, coords: [] };

  // Union of cells (rows + cols)
  const toClear = new Set();
  for (const y of rows) for (let x = 0; x < GRID_SIZE; x++) toClear.add(`${x},${y}`);
  for (const x of cols) for (let y = 0; y < GRID_SIZE; y++) toClear.add(`${x},${y}`);

  const coords = [];
  for (const key of toClear) {
    const [xStr, yStr] = key.split(",");
    coords.push({ x: Number(xStr), y: Number(yStr) });
  }

  return { rows: rows.length, cols: cols.length, cells: toClear.size, coords };
}

function applyClear(coords) {
  for (const c of coords) {
    board[c.y][c.x] = null;
  }
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

// Generate all permutations of an array
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
    const perms = permutations(remaining);
    for (const perm of perms) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

// Check if a set of pieces can be placed in some order on the current board
function isSolvablePieceSet(pieces) {
  // Filter out null pieces
  const validPieces = pieces.filter(piece => piece !== null);
  if (validPieces.length === 0) return true;

  // Generate all permutations of the pieces
  const piecePerms = permutations(validPieces);

  // Test each permutation
  for (const perm of piecePerms) {
    // Create a copy of the board to simulate placement
    const testBoard = board.map(row => [...row]);
    let allPlaced = true;

    // Try to place each piece in this order
    for (const piece of perm) {
      let placed = false;

      // Try every possible position
      for (let y = 0; y < GRID_SIZE && !placed; y++) {
        for (let x = 0; x < GRID_SIZE && !placed; x++) {
          if (canPlaceOnBoard(piece, x, y, testBoard)) {
            // Place the piece on the test board
            placePieceOnBoard(piece, x, y, testBoard);
            placed = true;
          }
        }
      }

      if (!placed) {
        allPlaced = false;
        break;
      }
    }

    if (allPlaced) {
      return true; // Found a valid order
    }
  }

  return false; // No valid order found
}

// Helper function to check placement on a specific board state
function canPlaceOnBoard(piece, originX, originY, testBoard) {
  for (const c of piece.shape) {
    const x = originX + c.x;
    const y = originY + c.y;
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
    if (testBoard[y][x] !== null) return false;
  }
  return true;
}

// Helper function to place a piece on a specific board state
function placePieceOnBoard(piece, originX, originY, testBoard) {
  for (const c of piece.shape) {
    const x = originX + c.x;
    const y = originY + c.y;
    testBoard[y][x] = piece.color;
  }
}

function maybeDealNewHand() {
  const remaining = hand.filter(Boolean).length;
  if (remaining === 0) {
    // Keep generating new piece sets until we find one that's solvable
    let attempts = 0;
    const maxAttempts = 100; // Prevent infinite loops

    do {
      hand = Array.from({ length: PIECES_PER_ROUND }, () => makePiece());
      attempts++;
    } while (!isSolvablePieceSet(hand) && attempts < maxAttempts);

    // If we still couldn't find a solvable set after max attempts,
    // just use whatever we have (fallback to prevent game freezing)
    if (attempts >= maxAttempts) {
      console.warn("Could not generate solvable piece set after", maxAttempts, "attempts");
    }

    renderHand();
  }
}

function startNewGame() {
  board = makeEmptyBoard();
  seedBoardRandomBlocks();
  hand = Array.from({ length: PIECES_PER_ROUND }, () => makePiece());
  combo = 0;
  isAnimating = false;
  setScore(0);
  showGameOver(false);
  clearGhost();
  boardEl.classList.remove("line-clear");
  renderBoard();
  renderHand();
}

function vibrate(pattern) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

function pulseBoard(className, ms) {
  boardEl.classList.remove(className);
  // force reflow to restart animation
  // eslint-disable-next-line no-unused-expressions
  boardEl.offsetWidth;
  boardEl.classList.add(className);
  window.setTimeout(() => boardEl.classList.remove(className), ms);
}

function addTempClass(coords, className, ms) {
  for (const c of coords) {
    const el = cellEls[c.y]?.[c.x];
    if (el) el.classList.add(className);
  }
  window.setTimeout(() => {
    for (const c of coords) {
      const el = cellEls[c.y]?.[c.x];
      if (el) el.classList.remove(className);
    }
  }, ms);
}

function isPerfectPlacement(placedCoords) {
  // "Perfect": the placed piece makes contact on ALL 4 sides (N/S/E/W)
  // with either the board edge or existing blocks (excluding the piece itself).
  const set = new Set(placedCoords.map((c) => `${c.x},${c.y}`));
  let touchUp = false;
  let touchDown = false;
  let touchLeft = false;
  let touchRight = false;

  for (const c of placedCoords) {
    const upY = c.y - 1;
    if (upY < 0) touchUp = true;
    else if (board[upY][c.x] !== null && !set.has(`${c.x},${upY}`)) touchUp = true;

    const downY = c.y + 1;
    if (downY >= GRID_SIZE) touchDown = true;
    else if (board[downY][c.x] !== null && !set.has(`${c.x},${downY}`)) touchDown = true;

    const leftX = c.x - 1;
    if (leftX < 0) touchLeft = true;
    else if (board[c.y][leftX] !== null && !set.has(`${leftX},${c.y}`)) touchLeft = true;

    const rightX = c.x + 1;
    if (rightX >= GRID_SIZE) touchRight = true;
    else if (board[c.y][rightX] !== null && !set.has(`${rightX},${c.y}`)) touchRight = true;
  }

  return touchUp && touchDown && touchLeft && touchRight;
}

function boardCellFromPointer(clientX, clientY) {
  const rect = boardEl.getBoundingClientRect();
  
  const styles = getComputedStyle(boardEl);
  const padL = parseFloat(styles.paddingLeft) || 0;
  const padR = parseFloat(styles.paddingRight) || 0;
  const padT = parseFloat(styles.paddingTop) || 0;
  const padB = parseFloat(styles.paddingBottom) || 0;

  const innerW = Math.max(1, rect.width - padL - padR);
  const innerH = Math.max(1, rect.height - padT - padB);

  // Calculate relative position
  const relX = clientX - rect.left - padL;
  const relY = clientY - rect.top - padT;

  // Only return null if pointer is far outside bounds (allows slight overflow for edge cases)
  const margin = 20;
  if (
    relX < -margin ||
    relX > innerW + margin ||
    relY < -margin ||
    relY > innerH + margin
  )
    return null;

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

  const clampedX = Math.max(minX, Math.min(maxX, desiredOriginX));
  const clampedY = Math.max(minY, Math.min(maxY, desiredOriginY));

  if (canPlace(piece, clampedX, clampedY)) return { x: clampedX, y: clampedY, ok: true };

  return { x: clampedX, y: clampedY, ok: false };
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
  el.style.gridTemplateColumns = `repeat(${b.w}, var(--drag-cell, 26px))`;
  el.style.gridTemplateRows = `repeat(${b.h}, var(--drag-cell, 26px))`;
  el.style.setProperty("--fill", piece.color);

  const on = new Set(piece.shape.map((c) => `${c.x},${c.y}`));
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const pcell = document.createElement("div");
      pcell.className = "pcell" + (on.has(`${x},${y}`) ? " on" : "");
      if (on.has(`${x},${y}`)) pcell.style.setProperty("--fill", piece.color);
      el.appendChild(pcell);
    }
  }
  return el;
}

function isMobileLayout() {
  return window.matchMedia && window.matchMedia("(max-width: 920px)").matches;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function clampToViewport(clientX, clientY, margin = 18) {
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  return {
    x: clamp(clientX, margin, Math.max(margin, w - margin)),
    y: clamp(clientY, margin, Math.max(margin, h - margin)),
  };
}

function scaledClientPoint(e, draggingState) {
  const mult = draggingState?.moveScale || 1;
  const dx = e.clientX - draggingState.startClientX;
  const dy = e.clientY - draggingState.startClientY;
  const p = {
    x: draggingState.startClientX + dx * mult,
    y: draggingState.startClientY + dy * mult,
  };
  return clampToViewport(p.x, p.y);
}

function onPointerDownPiece(e) {
  const slot = e.target.closest(".piece-slot");
  if (!slot) return;
  const idx = Number(slot.dataset.idx);
  const piece = hand[idx];
  if (!piece) return;
  if (modalEl.classList.contains("show")) return;
  if (isAnimating) return;

  e.preventDefault();
  clearGhost();

  const dragEl = makeDragGhostEl(piece);
  dragLayerEl.appendChild(dragEl);
  dragLayerEl.setAttribute("aria-hidden", "false");
  dragEl.style.left = `${e.clientX}px`;
  dragEl.style.top = `${e.clientY}px`;

  dragging = {
    pieceIdx: idx,
    piece,
    pointerId: e.pointerId,
    dragEl,
    startClientX: e.clientX,
    startClientY: e.clientY,
    // On mobile: a little assist, but not too sensitive.
    moveScale: isMobileLayout() ? 1.45 : 1,
  };
  document.addEventListener("pointermove", onPointerMove, { passive: false });
  document.addEventListener("pointerup", onPointerUp, { passive: false });
}

function onPointerMove(e) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  e.preventDefault();
  const p = scaledClientPoint(e, dragging);
  dragging.dragEl.style.left = `${p.x}px`;
  dragging.dragEl.style.top = `${p.y}px`;

  const g = ghostForPointer(dragging.piece, p.x, p.y);
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
  const p = scaledClientPoint(e, dragging);
  const g = ghostForPointer(piece, p.x, p.y);
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
    vibrate(12);
    pulseBoard("invalid-drop", 240);
    clearGhost();
    return;
  }

  // Place + animate
  const placedCoords = piece.shape.map((c) => ({ x: g.originX + c.x, y: g.originY + c.y }));
  placePiece(piece, g.originX, g.originY);
  hand[handIdx] = null;

  // Base points: blocks placed
  let delta = piece.size;

  const perfect = isPerfectPlacement(placedCoords);
  const cleared = computeFullLines();
  const lines = cleared.rows + cleared.cols;
  if (lines > 0) {
    combo += 1;
    // Lines are worth more; combo multiplies gently
    delta += Math.round(
      (lines * 100 + cleared.cells * 2) * (1 + Math.min(combo - 1, 6) * 0.15),
    );

    // Extra bonus for clearing multiple lines at once (2+).
    if (lines > 1) {
      // Tuned for 7x7: meaningful, but not runaway.
      delta += (lines - 1) * 220 + lines * lines * 35;
    }
  } else {
    combo = 0;
  }

  setScore(score + delta);
  renderBoard();
  clearGhost();
  pulseBoard("place-impact", 200);

  // Haptics + placed animation
  if (lines > 0) vibrate([20, 30, 40]);
  else if (perfect) vibrate([25, 20, 25]);
  else vibrate(18);

  addTempClass(placedCoords, "just-placed", 220);
  if (perfect) addTempClass(placedCoords, "perfect", 520);

  // Clear animation (big)
  if (lines > 0) {
    isAnimating = true;
    boardEl.classList.add("line-clear");
    addTempClass(cleared.coords, "clearing", 340);

    window.setTimeout(() => {
      applyClear(cleared.coords);
      boardEl.classList.remove("line-clear");
      renderBoard();
      isAnimating = false;

      maybeDealNewHand();
      renderHand();
      if (!anyMovesAvailable()) showGameOver(true);
    }, 330);
    return;
  }

  maybeDealNewHand();
  renderHand();
  if (!anyMovesAvailable()) showGameOver(true);
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

