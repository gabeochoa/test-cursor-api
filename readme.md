# Block Blast (JavaScript)

A lightweight, dependency-free Block Blast-style puzzle game built with **vanilla HTML/CSS/JS**.

## How to run

Open `index.html` directly, or run a tiny local server (recommended):

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## How to play

- **Drag** one of the 3 pieces onto the 7×7 board.
- If the placement is valid, the piece locks in.
- **Full rows and/or columns clear** for extra points.
- When you can’t place any remaining piece, it’s **game over**.

## Files

- `index.html`: UI shell
- `style.css`: styling
- `game.js`: game logic (piece generation, drag/drop, clears, scoring, game-over)
