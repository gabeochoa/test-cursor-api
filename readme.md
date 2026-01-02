# Block Blast (JavaScript)

A lightweight, dependency-free Block Blast-style puzzle game built with **vanilla HTML/CSS/JS**.

## How to run

### Option 1: Live reloading (recommended for development)

This method provides automatic browser refresh when you save changes:

```bash
# Install dependencies (first time only)
npm install

# Start the development server with live reloading
npm start
```

Then visit `http://localhost:3000`.

The server is accessible from other devices on your network at `http://<YOUR_IP>:3000`.

### Option 2: Simple local server

Open `index.html` directly, or run a tiny local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Test on mobile devices

Both server options automatically bind to all network interfaces, so you can test on mobile devices:

1) Find your computer's local IP address:

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```
# macOS:
ipconfig getifaddr en0

2) Find your computer’s local IP (LAN):

```bash
# Linux:
hostname -I

# Windows (Command Prompt):
ipconfig | findstr /R /C:"IPv4 Address"
```

2) On your phone/tablet (same Wi-Fi network), visit: `http://<YOUR_IP>:3000` (for npm) or `http://<YOUR_IP>:8000` (for Python)

Example: `http://192.168.1.23:3000`

**Note:** Make sure your firewall allows connections to the respective port (3000 for npm, 8000 for Python).

## How to play

- **Drag** one of the 3 pieces onto the 7×7 board.
- If the placement is valid, the piece locks in.
- **Full rows and/or columns clear** for extra points.
- When you can’t place any remaining piece, it’s **game over**.

## Files

- `index.html`: UI shell
- `style.css`: styling
- `game.js`: game logic (piece generation, drag/drop, clears, scoring, game-over)
