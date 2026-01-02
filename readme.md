# Block Blast (JavaScript)

A lightweight, dependency-free Block Blast-style puzzle game built with **vanilla HTML/CSS/JS**.

## How to run

Open `index.html` directly, or run a tiny local server (recommended):

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Open it on your phone (same Wi‑Fi)

Yes—use your computer’s **local IP address**.

1) Start the server bound to all interfaces:

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

2) Find your computer’s local IP (LAN):

```bash
# Linux:
hostname -I

# macOS (Wi‑Fi is usually en0):
ipconfig getifaddr en0

# macOS alternative:
ifconfig | grep "inet " | grep -v 127.0.0.1
```

3) On your phone (on the same Wi‑Fi), open:

`http://<YOUR_LAN_IP>:8000`

Example: `http://192.168.1.23:8000`

If it doesn’t load:
- Make sure your phone and computer are on the **same network**.
- Allow inbound connections to port **8000** in any firewall you’re running.

## How to play

- **Drag** one of the 3 pieces onto the 7×7 board.
- If the placement is valid, the piece locks in.
- **Full rows and/or columns clear** for extra points.
- When you can’t place any remaining piece, it’s **game over**.

## Files

- `index.html`: UI shell
- `style.css`: styling
- `game.js`: game logic (piece generation, drag/drop, clears, scoring, game-over)
