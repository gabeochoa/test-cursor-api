# Bug Report - Block Blast Game

## Critical Bugs

### 1. **Score Animation Interval Memory Leak** (game.js:221-234)
**Severity:** Medium  
**Location:** `setScore()` function

**Issue:** If `setScore()` is called multiple times rapidly (e.g., multiple line clears in quick succession), multiple `setInterval` timers are created without clearing previous ones. This causes:
- Multiple intervals running simultaneously
- Score jumping erratically
- Memory leak over time
- Performance degradation

**Current Code:**
```221:234:game.js
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
```

**Fix:** Store the interval ID in a module-level variable and clear it before creating a new one.

---

### 2. **Flame Effect Timeout Memory Leak** (game.js:246-277)
**Severity:** Medium  
**Location:** `triggerFlameEffect()` function

**Issue:** Multiple rapid calls to `triggerFlameEffect()` (e.g., clearing multiple lines quickly) create multiple `setTimeout` callbacks without clearing previous ones. This causes:
- Multiple timeouts executing out of order
- Flame effects not clearing properly
- Memory leak

**Current Code:**
```258:260:game.js
    setTimeout(() => {
      flamesOverlayEl.classList.remove("screen-takeover");
    }, 1500); // 1.5 seconds for screen takeover
```

```273:275:game.js
    setTimeout(() => {
      flamesOverlayEl.classList.remove("active");
    }, 1500); // 1.5 seconds for regular flames
```

**Fix:** Store timeout IDs in module-level variables and clear them before setting new ones.

---

### 3. **Placement Failure Still Removes Piece** (game.js:944-947)
**Severity:** High  
**Location:** `onPointerUp()` function

**Issue:** The `placePiece()` function can fail silently (returns early on validation errors), but the piece is still removed from the hand array. This causes:
- Pieces disappearing without being placed
- Game state inconsistency
- Player frustration

**Current Code:**
```944:947:game.js
  // Place the piece
  const placedCoords = piece.shape.map((c) => ({ x: g.originX + c.x, y: g.originY + c.y }));
  placePiece(piece, g.originX, g.originY);
  hand[handIdx] = null;
```

**Problem:** `placePiece()` returns `undefined` (early return) on failure, but there's no check for success before removing the piece.

**Fix:** Make `placePiece()` return a boolean indicating success, and only remove the piece if placement succeeded.

---

### 4. **Redundant DOM Query in Flame Effect** (game.js:263)
**Severity:** Low  
**Location:** `triggerFlameEffect()` function

**Issue:** The function queries `document.getElementById("score")` every time it's called, but `scoreEl` is already available as a global variable.

**Current Code:**
```263:265:game.js
    const scoreEl = document.getElementById("score");
    const scoreRect = scoreEl.getBoundingClientRect();
    const scoreParentRect = scoreEl.closest(".stat").getBoundingClientRect();
```

**Fix:** Use the existing `scoreEl` global variable instead of querying the DOM.

---

### 5. **Event Listener Cleanup Order** (game.js:925-929)
**Severity:** Low  
**Location:** `onPointerUp()` function

**Issue:** The `dragging` variable is set to `null` before removing event listeners. If an error occurs between these operations, the listeners might not be cleaned up properly.

**Current Code:**
```925:929:game.js
  // Cleanup drag UI first
  dragging.dragEl.remove();
  dragLayerEl.setAttribute("aria-hidden", "true");
  dragging = null;
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);
```

**Fix:** Remove event listeners before setting `dragging` to null, or use a try-finally block to ensure cleanup.

---

## Potential Edge Cases

### 6. **Race Condition in Animation State** (game.js:994-1008)
**Severity:** Low  
**Location:** `onPointerUp()` function, line clear animation

**Issue:** If a player places a piece while `isAnimating` is true (from a previous clear), the new placement might interfere with the ongoing animation. The check at line 868 prevents starting a drag, but not all edge cases are covered.

**Current Code:**
```994:1008:game.js
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
```

**Note:** This is mostly handled, but if multiple clears happen in rapid succession, the timeout might execute out of order.

---

### 7. **Board State Inconsistency During Clear Animation** (game.js:999-1008)
**Severity:** Low  
**Location:** `onPointerUp()` function

**Issue:** The board state is updated (piece placed) before the clear animation completes. If `anyMovesAvailable()` is called during the animation, it checks against the board with the piece already placed but lines not yet cleared, which is correct. However, if the game over check happens during animation, it might show incorrect results.

**Note:** This appears to be handled correctly as the check happens after the animation completes.

---

### 8. **Potential Issue with Large Pieces in Solvability Check** (game.js:527-531)
**Severity:** Very Low  
**Location:** `isSolvablePieceSet()` function

**Issue:** If a piece's width or height exceeds `GRID_SIZE`, the `maxX` or `maxY` calculations will be negative, causing the placement loops to never execute. While this is technically correct (such pieces can't be placed), the code doesn't explicitly handle or document this edge case.

**Current Code:**
```527:531:game.js
      const maxX = GRID_SIZE - b.w;
      const maxY = GRID_SIZE - b.h;

      for (let y = 0; y <= maxY && !placed; y++) {
        for (let x = 0; x <= maxX && !placed; x++) {
```

**Note:** This is unlikely to occur in practice since pieces are generated from a fixed catalog, but it's worth documenting or adding an early return for clarity.

---

## Summary

**Total Bugs Found:** 8
- **Critical:** 1 (Bug #3 - Piece removal on failed placement)
- **Medium:** 2 (Bugs #1, #2 - Memory leaks)
- **Low:** 5 (Bugs #4, #5, #6, #7, #8 - Code quality and edge cases)

**Recommended Priority:**
1. Fix Bug #3 (High priority - affects gameplay)
2. Fix Bug #1 (Medium priority - memory leak)
3. Fix Bug #2 (Medium priority - memory leak)
4. Fix Bugs #4, #5 (Low priority - code quality)

