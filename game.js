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

/** Animation/timer state */
let scoreIntervalId = null; // Track score animation interval
let flameTimeoutId = null; // Track flame effect timeout

/** AI mode state */
let isAIMode = false;
let aiIntervalId = null;
let aiPlacementDelay = 800; // ms between AI placements

function randInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function getQueryParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

function initAIMode() {
  // Check for AI mode query parameter
  isAIMode = getQueryParam('ai') === 'true' || getQueryParam('autoplay') === 'true';
  updateAITitle();
  if (isAIMode) {
    console.log('🤖 AI mode enabled - automatic gameplay activated');
    startAI();
  }
}

function updateAITitle() {
  const titleEl = document.querySelector('.title');
  if (titleEl) {
    const baseTitle = 'Block Blast';
    titleEl.textContent = isAIMode ? `${baseTitle} 🤖` : baseTitle;
  }
}

function toggleAIMode() {
  isAIMode = !isAIMode;
  updateAITitle();

  if (isAIMode) {
    console.log('🤖 AI mode activated manually');
    startAI();
  } else {
    console.log('🤖 AI mode deactivated');
    stopAI();
  }
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
  
  // Clear any existing score animation interval to prevent memory leaks
  if (scoreIntervalId !== null) {
    clearInterval(scoreIntervalId);
    scoreIntervalId = null;
  }
  
  // Flame effects are now triggered based on number of lines cleared, not score ratio

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
    scoreIntervalId = setInterval(() => {
      currentScore += increment;
      if (currentScore >= score) {
        currentScore = score;
        clearInterval(scoreIntervalId);
        scoreIntervalId = null;
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
  // Clear any existing flame effect timeout to prevent memory leaks
  if (flameTimeoutId !== null) {
    clearTimeout(flameTimeoutId);
    flameTimeoutId = null;
  }
  
  // Clear any existing flame effects
  flamesOverlayEl.classList.remove("active", "screen-takeover");

  // Force reflow to restart animation
  // eslint-disable-next-line no-unused-expressions
  flamesOverlayEl.offsetWidth;

  if (screenTakeover) {
    // Screen takeover: cover entire viewport
    flamesOverlayEl.classList.add("screen-takeover");
    // Remove after animation completes
    flameTimeoutId = setTimeout(() => {
      flamesOverlayEl.classList.remove("screen-takeover");
      flameTimeoutId = null;
    }, 1500); // 1.5 seconds for screen takeover
  } else {
    // Regular flames: center on score element (use existing global variable)
    const scoreRect = scoreEl.getBoundingClientRect();
    const scoreParentRect = scoreEl.closest(".stat").getBoundingClientRect();
    
    // Position overlay centered on the score stat element
    flamesOverlayEl.style.top = `${scoreParentRect.top + scoreParentRect.height / 2 - 60}px`;
    flamesOverlayEl.style.left = `${scoreParentRect.left + scoreParentRect.width / 2 - 60}px`;
    
    flamesOverlayEl.classList.add("active");
    // Remove after animation completes
    flameTimeoutId = setTimeout(() => {
      flamesOverlayEl.classList.remove("active");
      flameTimeoutId = null;
    }, 1500); // 1.5 seconds for regular flames
  }
}

function showGameOver(show) {
  modalEl.classList.toggle("show", show);
  modalEl.setAttribute("aria-hidden", show ? "false" : "true");

  // Stop AI when game ends
  if (show && isAIMode) {
    stopAI();
  }
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
  
  // Get CSS variables for slot dimensions
  const rootStyles = getComputedStyle(document.documentElement);
  const pieceCellSize = parseFloat(rootStyles.getPropertyValue('--piece-cell')) || 16;
  const pieceGap = parseFloat(rootStyles.getPropertyValue('--piece-gap')) || 4;
  const slotHeight = parseFloat(rootStyles.getPropertyValue('--piece-slot-h')) || 96;
  const slotPadding = isMobileLayout() ? 16 : 20; // padding top + bottom (8px * 2 or 10px * 2)
  
  // Calculate available height for pieces (slot height minus padding)
  const availableHeight = slotHeight - slotPadding;
  // Estimate available width (slots are typically around 120px wide, minus padding)
  const availableWidth = (isMobileLayout() ? 100 : 120) - (isMobileLayout() ? 16 : 20);
  
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
    
    // Calculate the actual dimensions needed for this piece
    const pieceHeight = b.h * pieceCellSize + Math.max(0, b.h - 1) * pieceGap;
    const pieceWidth = b.w * pieceCellSize + Math.max(0, b.w - 1) * pieceGap;
    
    // Calculate scale factor if piece is too tall or too wide
    const heightScale = pieceHeight > availableHeight ? availableHeight / pieceHeight : 1;
    const widthScale = pieceWidth > availableWidth ? availableWidth / pieceWidth : 1;
    const scale = Math.min(heightScale, widthScale, 1); // Don't scale up, only down
    
    const grid = document.createElement("div");
    grid.className = "piece";
    grid.style.gridTemplateColumns = `repeat(${b.w}, var(--piece-cell, 18px))`;
    grid.style.gridTemplateRows = `repeat(${b.h}, var(--piece-cell, 18px))`;
    grid.style.setProperty("--fill", piece.color);
    grid.dataset.pieceId = piece.id;
    
    // Apply scale if needed to fit within slot
    if (scale < 1) {
      grid.style.transform = `scale(${scale})`;
      grid.style.transformOrigin = 'center';
    }

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
  // Validate bounds before placing
  for (const c of piece.shape) {
    const x = originX + c.x;
    const y = originY + c.y;
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
      console.error("Attempted to place piece out of bounds", { originX, originY, x, y, shape: piece.shape });
      return false;
    }
    if (board[y][x] !== null) {
      console.error("Attempted to place piece on occupied cell", { originX, originY, x, y });
      return false;
    }
  }
  
  // All validations passed, place the piece
  for (const c of piece.shape) {
    const x = originX + c.x;
    const y = originY + c.y;
    board[y][x] = piece.color;
  }
  
  return true;
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
      const b = piece.bounds || bounds(piece.shape);
      
      // Skip pieces that are too large to fit on the board
      if (b.w > GRID_SIZE || b.h > GRID_SIZE) {
        allPlaced = false;
        break;
      }
      
      // Only check positions where the piece could actually fit
      const maxX = GRID_SIZE - b.w;
      const maxY = GRID_SIZE - b.h;

      for (let y = 0; y <= maxY && !placed; y++) {
        for (let x = 0; x <= maxX && !placed; x++) {
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

// Generate a hand of pieces that is guaranteed to be solvable on the current board
function generateSolvableHand() {
  let attempts = 0;
  const maxAttempts = 500; // Increased attempts for better reliability

  while (attempts < maxAttempts) {
    const newHand = Array.from({ length: PIECES_PER_ROUND }, () => makePiece());
    if (isSolvablePieceSet(newHand)) {
      return newHand;
    }
    attempts++;
  }

  // Fallback: if we can't find a solvable set, try generating smaller pieces
  // This should rarely happen, but provides a safety net
  console.warn("Could not generate solvable piece set after", maxAttempts, "attempts, trying smaller pieces");
  for (let attempt = 0; attempt < 100; attempt++) {
    // Try to generate pieces with smaller sizes (more likely to fit)
    const newHand = [];
    for (let i = 0; i < PIECES_PER_ROUND; i++) {
      // Prefer smaller shapes (first 20 shapes tend to be smaller)
      const shapeIdx = randInt(Math.min(20, SHAPES.length));
      const shape = SHAPES[shapeIdx];
      const size = shape.length;
      const b = bounds(shape);
      newHand.push({
        id: Math.random().toString(16).slice(2),
        shape,
        size,
        color: colorForSize(size),
        bounds: b,
      });
    }
    if (isSolvablePieceSet(newHand)) {
      return newHand;
    }
  }

  // Last resort: return random pieces (should be extremely rare)
  console.error("Failed to generate solvable hand, using random pieces");
  return Array.from({ length: PIECES_PER_ROUND }, () => makePiece());
}

function maybeDealNewHand() {
  const remaining = hand.filter(Boolean).length;
  if (remaining === 0) {
    hand = generateSolvableHand();
    renderHand();
  }
}

function startNewGame() {
  // Clear any running animations/timers
  if (scoreIntervalId !== null) {
    clearInterval(scoreIntervalId);
    scoreIntervalId = null;
  }
  if (flameTimeoutId !== null) {
    clearTimeout(flameTimeoutId);
    flameTimeoutId = null;
  }

  // Stop AI during game reset
  if (isAIMode) {
    stopAI();
  }

  board = makeEmptyBoard();
  seedBoardRandomBlocks();
  // Ensure the initial hand is solvable
  hand = generateSolvableHand();
  combo = 0;
  isAnimating = false;
  setScore(0);
  showGameOver(false);
  clearGhost();
  boardEl.classList.remove("line-clear");
  renderBoard();
  renderHand();

  // Restart AI after game setup if in AI mode
  if (isAIMode) {
    // Small delay to let the game render before starting AI
    setTimeout(startAI, 500);
  }
}

function vibrate(pattern) {
  // Web Vibration API works on mobile browsers (iOS Safari 13+, Chrome Android, etc.)
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Silently fail if vibration is not supported or blocked
    }
  }
}

// Enhanced haptic patterns for different game events
function hapticPlacePiece() {
  vibrate(15); // Quick tap for normal placement
}

function hapticPerfectPlacement() {
  vibrate([10, 20, 10, 20, 10]); // Double-tap pattern for perfect placement
}

function hapticLineClear(lines) {
  if (lines >= 3) {
    // Epic pattern for 3+ lines
    vibrate([20, 30, 20, 40, 20, 50, 30]);
  } else if (lines === 2) {
    // Strong pattern for 2 lines
    vibrate([20, 30, 20, 40, 20]);
  } else {
    // Single line clear
    vibrate([20, 30, 20]);
  }
}

function hapticInvalidDrop() {
  vibrate([10, 20, 10, 20]); // Quick double vibration for error
}

function hapticPickupPiece() {
  vibrate(5); // Subtle tap when picking up a piece
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
    if (el) {
      el.classList.add(className);
      // For clearing animation, we want to KEEP the filled appearance
      // so the flash animation is visible. We'll clear it after animation.
      if (className === "clearing") {
        // Don't remove filled class here - let animation show on filled cells
      }
    }
  }
  window.setTimeout(() => {
    for (const c of coords) {
      const el = cellEls[c.y]?.[c.x];
      if (el) {
        el.classList.remove(className);
        // After clearing animation completes, remove filled appearance
        if (className === "clearing") {
          el.classList.remove("filled");
          el.style.removeProperty("--fill");
        }
      }
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

function ratePlacement(placedCoords) {
  // Rate placement quality: "eh", "okay", "nice", "great", "perfect"
  // Returns: { level: string, score: number }
  const set = new Set(placedCoords.map((c) => `${c.x},${c.y}`));
  
  let totalTouchingSides = 0;
  let blocksTouchingAny = 0;
  let blocksTouchingAll = 0;
  const totalBlocks = placedCoords.length;
  
  for (const c of placedCoords) {
    let touchUp = false;
    let touchDown = false;
    let touchLeft = false;
    let touchRight = false;
    let touchingAny = false;
    
    // Check up
    const upY = c.y - 1;
    if (upY < 0) {
      touchUp = true;
    } else if (board[upY][c.x] !== null && !set.has(`${c.x},${upY}`)) {
      touchUp = true;
      touchingAny = true;
    }
    
    // Check down
    const downY = c.y + 1;
    if (downY >= GRID_SIZE) {
      touchDown = true;
    } else if (board[downY][c.x] !== null && !set.has(`${c.x},${downY}`)) {
      touchDown = true;
      touchingAny = true;
    }
    
    // Check left
    const leftX = c.x - 1;
    if (leftX < 0) {
      touchLeft = true;
    } else if (board[c.y][leftX] !== null && !set.has(`${leftX},${c.y}`)) {
      touchLeft = true;
      touchingAny = true;
    }
    
    // Check right
    const rightX = c.x + 1;
    if (rightX >= GRID_SIZE) {
      touchRight = true;
    } else if (board[c.y][rightX] !== null && !set.has(`${rightX},${c.y}`)) {
      touchRight = true;
      touchingAny = true;
    }
    
    const sidesTouching = (touchUp ? 1 : 0) + (touchDown ? 1 : 0) + 
                          (touchLeft ? 1 : 0) + (touchRight ? 1 : 0);
    totalTouchingSides += sidesTouching;
    
    if (touchingAny) blocksTouchingAny++;
    if (sidesTouching === 4) blocksTouchingAll++;
  }
  
  const avgTouchingSides = totalTouchingSides / totalBlocks;
  const allBlocksTouchingAll = blocksTouchingAll === totalBlocks;
  const mostBlocksTouching = blocksTouchingAny / totalBlocks;
  
  // Perfect: all blocks touching on all 4 sides
  if (allBlocksTouchingAll) {
    return { level: "perfect", score: 5 };
  }
  
  // Great: most blocks touching on all sides, or all blocks touching existing
  if (blocksTouchingAll >= totalBlocks * 0.7 || (mostBlocksTouching >= 0.9 && avgTouchingSides >= 3.5)) {
    return { level: "great", score: 4 };
  }
  
  // Nice: good contact with existing blocks
  if (mostBlocksTouching >= 0.6 && avgTouchingSides >= 2.5) {
    return { level: "nice", score: 3 };
  }
  
  // Okay: some contact with existing blocks
  if (mostBlocksTouching >= 0.3 || avgTouchingSides >= 2) {
    return { level: "okay", score: 2 };
  }
  
  // Eh: minimal or no contact
  return { level: "eh", score: 1 };
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

  // Clamp relative positions to valid range before calculating cell indices
  // This prevents negative values from causing incorrect cell calculations
  const clampedRelX = Math.max(0, Math.min(innerW - 0.001, relX));
  const clampedRelY = Math.max(0, Math.min(innerH - 0.001, relY));

  // Bias towards top row when near the top edge (makes it easier to place at top)
  // Top 25% of board area biases towards row 0
  const topBiasZone = innerH * 0.25;
  let y;
  if (clampedRelY < topBiasZone) {
    // When in top zone, bias towards row 0
    // Use a threshold that's easier to hit - about 40% of first cell height
    const threshold = cellH * 0.4;
    y = clampedRelY < threshold ? 0 : Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(clampedRelY / cellH)));
  } else {
    y = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(clampedRelY / cellH)));
  }

  const x = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(clampedRelX / cellW)));
  return { x, y };
}

function nearestValidOrigin(piece, desiredOriginX, desiredOriginY) {
  const b = piece.bounds || bounds(piece.shape);
  const minX = 0;
  const minY = 0;
  const maxX = GRID_SIZE - b.w;
  const maxY = GRID_SIZE - b.h;

  // Clamp to valid bounds for this piece size
  const clampedX = Math.max(minX, Math.min(maxX, desiredOriginX));
  const clampedY = Math.max(minY, Math.min(maxY, desiredOriginY));

  // Check if the clamped position is valid
  const ok = canPlace(piece, clampedX, clampedY);
  return { x: clampedX, y: clampedY, ok };
}

function ghostForPointer(piece, clientX, clientY) {
  // Calculate which board cell the pointer is over
  const pos = boardCellFromPointer(clientX, clientY);
  if (!pos) return null;
  
  // Find the nearest valid origin for this piece at this cell
  const snapped = nearestValidOrigin(piece, pos.x, pos.y);
  
  // Calculate all cells this piece would occupy
  const cells = piece.shape.map((c) => ({ 
    x: snapped.x + c.x, 
    y: snapped.y + c.y 
  }));
  
  // Filter to only visible cells (for ghost highlighting)
  const visible = cells.filter(
    (c) => c.x >= 0 && c.x < GRID_SIZE && c.y >= 0 && c.y < GRID_SIZE,
  );
  
  return { 
    ok: snapped.ok, 
    originX: snapped.x, 
    originY: snapped.y, 
    cells: visible, 
    rawCells: cells 
  };
}

function makeDragGhostEl(piece) {
  const b = bounds(piece.shape);
  
  // Calculate actual board cell size to match the drop zone
  const boardRect = boardEl.getBoundingClientRect();
  const styles = getComputedStyle(boardEl);
  const padL = parseFloat(styles.paddingLeft) || 0;
  const padR = parseFloat(styles.paddingRight) || 0;
  const padT = parseFloat(styles.paddingTop) || 0;
  const padB = parseFloat(styles.paddingBottom) || 0;
  const gap = parseFloat(styles.gap) || 3;
  
  const innerW = Math.max(1, boardRect.width - padL - padR);
  const innerH = Math.max(1, boardRect.height - padT - padB);
  
  // Calculate cell size (accounting for gaps between cells)
  const cellW = (innerW - (GRID_SIZE - 1) * gap) / GRID_SIZE;
  const cellH = (innerH - (GRID_SIZE - 1) * gap) / GRID_SIZE;
  const boardCellSize = Math.min(cellW, cellH);
  
  // Scale drag ghost to 80% of board cell size
  const cellSize = boardCellSize * 0.8;
  const scaledGap = gap * 0.8;
  
  const el = document.createElement("div");
  el.className = "drag-ghost piece";
  el.style.gridTemplateColumns = `repeat(${b.w}, ${cellSize}px)`;
  el.style.gridTemplateRows = `repeat(${b.h}, ${cellSize}px)`;
  el.style.setProperty("--fill", piece.color);
  el.style.setProperty("--piece-gap", `${scaledGap}px`);
  
  // Set the cell size CSS variable so pcell elements use the correct size
  // This overrides the default --drag-cell value
  el.style.setProperty("--piece-cell", `${cellSize}px`);
  el.style.setProperty("--drag-cell", `${cellSize}px`);

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
  const multX = draggingState?.moveScaleX || 1;
  const multY = draggingState?.moveScaleY || draggingState?.moveScale || 1;
  const dx = e.clientX - draggingState.startClientX;
  const dy = e.clientY - draggingState.startClientY;
  const p = {
    x: draggingState.startClientX + dx * multX,
    y: draggingState.startClientY + dy * multY,
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

  // Haptic feedback when picking up a piece
  hapticPickupPiece();

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
    // X axis: moderate scaling (less than Y but more responsive than before)
    moveScaleX: isMobileLayout() ? 1.5 : 1.2,
    // Y axis: increased sensitivity so you don't have to drag as far to reach top
    moveScaleY: isMobileLayout() ? 2.2 : 1.9,
  };
  document.addEventListener("pointermove", onPointerMove, { passive: false });
  document.addEventListener("pointerup", onPointerUp, { passive: false });
}

function onPointerMove(e) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  e.preventDefault();
  
  // Update visual drag element position with scaled coordinates
  const p = scaledClientPoint(e, dragging);
  dragging.dragEl.style.left = `${p.x}px`;
  dragging.dragEl.style.top = `${p.y}px`;

  // Use scaled coordinates for ghost calculation so drop zone matches visual drag element
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
  const dragEl = dragging.dragEl;
  
  // Use scaled coordinates for placement so it matches the visual drag element and ghost
  const p = scaledClientPoint(e, dragging);
  const g = ghostForPointer(piece, p.x, p.y);

  // Cleanup drag UI and event listeners first (before any early returns)
  // Use try-finally to ensure cleanup happens even if errors occur
  try {
    dragEl.remove();
    dragLayerEl.setAttribute("aria-hidden", "true");
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  } finally {
    dragging = null;
  }

  // Validate placement
  if (!g) {
    clearGhost();
    return;
  }

  if (!g.ok || !canPlace(piece, g.originX, g.originY)) {
    hapticInvalidDrop();
    pulseBoard("invalid-drop", 240);
    clearGhost();
    return;
  }

  // Place the piece - only remove from hand if placement succeeds
  const placedCoords = piece.shape.map((c) => ({ x: g.originX + c.x, y: g.originY + c.y }));
  const placementSuccess = placePiece(piece, g.originX, g.originY);
  
  if (!placementSuccess) {
    // Placement failed despite validation - this shouldn't happen, but handle it gracefully
    console.error("Placement failed after validation passed");
    hapticInvalidDrop();
    pulseBoard("invalid-drop", 240);
    clearGhost();
    return;
  }
  
  hand[handIdx] = null;

  // Base points: blocks placed
  let delta = piece.size;

  const perfect = isPerfectPlacement(placedCoords);
  const placementRating = ratePlacement(placedCoords);
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
      
      // Trigger flame overlay only when multiple lines (2+) are cleared
      if (lines >= 3) {
        // 3+ lines = screen takeover flames
        triggerFlameEffect(true);
      } else {
        // 2 lines = regular flames
        triggerFlameEffect(false);
      }
    }
  } else {
    combo = 0;
  }

  setScore(score + delta);
  renderBoard();
  clearGhost();
  pulseBoard("place-impact", 300);

  // Haptics + placed animation based on rating
  if (lines > 0) {
    hapticLineClear(lines);
  } else {
    switch (placementRating.level) {
      case "perfect":
        hapticPerfectPlacement();
        break;
      case "great":
        vibrate([15, 25, 15]);
        break;
      case "nice":
        vibrate([12, 20, 12]);
        break;
      case "okay":
        vibrate(10);
        break;
      default: // "eh"
        hapticPlacePiece();
    }
  }

  // Apply animations based on placement rating
  if (placementRating.level === "perfect") {
    addTempClass(placedCoords, "perfect", 850);
    addTempClass(placedCoords, "just-placed", 450);
  } else if (placementRating.level === "great") {
    addTempClass(placedCoords, "great-placement", 500);
  } else if (placementRating.level === "nice") {
    addTempClass(placedCoords, "nice-placement", 400);
  } else if (placementRating.level === "okay") {
    addTempClass(placedCoords, "okay-placement", 300);
  }
  // "eh" gets no special animation

  // Clear animation (big)
  if (lines > 0) {
    isAnimating = true;
    boardEl.classList.add("line-clear");

    // Apply clear immediately when animation starts
    applyClear(cleared.coords);

    // Add clearing animation and ensure cells appear cleared
    addTempClass(cleared.coords, "clearing", 650);

    window.setTimeout(() => {
      // Animation cleanup
      boardEl.classList.remove("line-clear");
      isAnimating = false;

      maybeDealNewHand();
      renderHand();
      if (!anyMovesAvailable()) showGameOver(true);
    }, 650); // Wait for full animation to complete
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
    if (e.key === "a" && e.ctrlKey) {
      e.preventDefault();
      toggleAIMode();
    }
  });
}

function findBestPlacement(piece) {
  const b = piece.bounds || bounds(piece.shape);
  let bestPlacement = null;
  let bestRating = { score: -1 };
  let validPlacements = 0;

  // Try all possible positions for this piece
  for (let y = 0; y <= GRID_SIZE - b.h; y++) {
    for (let x = 0; x <= GRID_SIZE - b.w; x++) {
      if (canPlace(piece, x, y)) {
        validPlacements++;
        // Calculate placed coordinates for rating
        const placedCoords = piece.shape.map(c => ({ x: x + c.x, y: y + c.y }));

        // Rate this placement
        const rating = ratePlacement(placedCoords);

        // Keep track of the best placement
        if (rating.score > bestRating.score) {
          bestRating = rating;
          bestPlacement = { originX: x, originY: y, rating };
        }
      }
    }
  }

  return bestPlacement;
}

function aiMakeMove() {
  if (!isAIMode || isAnimating || modalEl.classList.contains("show")) {
    return;
  }

  // Find the best placement for each piece in hand
  const placements = [];
  for (let i = 0; i < hand.length; i++) {
    const piece = hand[i];
    if (piece) {
      const placement = findBestPlacement(piece);
      if (placement) {
        placements.push({ pieceIdx: i, piece, ...placement });
      }
    }
  }

  if (placements.length === 0) {
    console.log('🤖 AI: No valid placements found - game over');
    return;
  }

  // Choose the best placement overall
  const bestPlacement = placements.reduce((best, current) =>
    current.rating.score > best.rating.score ? current : best
  );

  console.log(`🤖 AI placing piece ${bestPlacement.pieceIdx} at (${bestPlacement.originX}, ${bestPlacement.originY}) - Rating: ${bestPlacement.rating.level} (${bestPlacement.rating.score})`);

  // Simulate the placement
  const success = placePiece(bestPlacement.piece, bestPlacement.originX, bestPlacement.originY);
  if (success) {
    hand[bestPlacement.pieceIdx] = null;

    // Calculate scoring and effects (same as manual placement)
    const placedCoords = bestPlacement.piece.shape.map(c => ({
      x: bestPlacement.originX + c.x,
      y: bestPlacement.originY + c.y
    }));

    // Base points: blocks placed
    let delta = bestPlacement.piece.size;

    const perfect = isPerfectPlacement(placedCoords);
    const placementRating = bestPlacement.rating;
    const cleared = computeFullLines();
    const lines = cleared.rows + cleared.cols;

    if (lines > 0) {
      combo += 1;
      // Lines are worth more; combo multiplies gently
      delta += Math.round(
        (lines * 100 + cleared.cells * 2) * (1 + Math.min(combo - 1, 6) * 0.15)
      );

      // Extra bonus for clearing multiple lines at once (2+).
      if (lines > 1) {
        delta += (lines - 1) * 220 + lines * lines * 35;

        if (lines >= 3) {
          triggerFlameEffect(true);
        } else {
          triggerFlameEffect(false);
        }
      }
    } else {
      combo = 0;
    }

    setScore(score + delta);
    renderBoard();

    // Apply animations based on placement rating
    if (placementRating.level === "perfect") {
      addTempClass(placedCoords, "perfect", 850);
      addTempClass(placedCoords, "just-placed", 450);
    } else if (placementRating.level === "great") {
      addTempClass(placedCoords, "great-placement", 500);
    } else if (placementRating.level === "nice") {
      addTempClass(placedCoords, "nice-placement", 400);
    } else if (placementRating.level === "okay") {
      addTempClass(placedCoords, "okay-placement", 300);
    }

    // Handle line clearing
    if (lines > 0) {
      isAnimating = true;
      boardEl.classList.add("line-clear");
      addTempClass(cleared.coords, "clearing", 650);

      applyClear(cleared.coords);

      setTimeout(() => {
        boardEl.classList.remove("line-clear");
        isAnimating = false;
        maybeDealNewHand();
        renderHand();
        if (!anyMovesAvailable()) showGameOver(true);
      }, 650);
    } else {
      maybeDealNewHand();
      renderHand();
      if (!anyMovesAvailable()) showGameOver(true);
    }
  }
}

function startAI() {
  if (aiIntervalId) {
    clearInterval(aiIntervalId);
  }

  console.log(`🤖 AI mode starting with ${aiPlacementDelay}ms delay between moves`);
  aiIntervalId = setInterval(aiMakeMove, aiPlacementDelay);

  // Also try to make an immediate move if possible
  setTimeout(() => {
    console.log('🤖 AI: Attempting immediate first move');
    aiMakeMove();
  }, 100);
}

function stopAI() {
  if (aiIntervalId) {
    clearInterval(aiIntervalId);
    aiIntervalId = null;
    console.log('🤖 AI mode stopped');
  }
}

function main() {
  bestScoreEl.textContent = String(bestScore);
  initBoardDom();
  wireEvents();
  initAIMode(); // Initialize AI mode
  startNewGame();
}

main();

