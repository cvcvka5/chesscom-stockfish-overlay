# chesscom-stockfish-overlay

Browser console script that runs Stockfish 10 in a Blob Web Worker, polls `<wc-chess-board>` on Chess.com for position changes, and draws an SVG arrow over the best move. Tested against the Magnus Carlsen bot on Chess.com, where it won the game.

![Overlay preview showing Stockfish suggesting Nf3](assets/overlay-preview.jpg)

Tested against the Magnus Carlsen bot on Chess.com, winning with 89.3% accuracy to 82.4%.

![Game review graph and accuracy comparison against the Magnus Carlsen bot](assets/magnus-bot-result.png)

Use this only for local study, bot games, or post-game analysis. Running external engines in live rated games violates Chess.com's Fair Play Policy and will result in an account ban.

## Usage

1. Open a board page on Chess.com.
2. Open the browser DevTools console (`Cmd + Option + J` on macOS, `Ctrl + Shift + J` on Windows/Linux).
3. Copy the contents of `src/stockfish-overlay.js`, paste into the console, and press Enter.

To stop the polling loop, terminate the worker, and remove the overlay:

```js
stopStockfish()

```

## Configuration

Edit the constants at the top of `src/stockfish-overlay.js`:

* `SEARCH_DEPTH` (default `14`): UCI search depth. Lower values return moves faster; higher values take longer.
* `POLL_MS` (default `800`): Interval in milliseconds between board state checks.
* `CDN_URL`: URL to a single-threaded `stockfish.js` build.

## How it works

* **Worker loading**: Browsers block `new Worker()` calls to cross-origin URLs, and Chess.com pages do not send `Cross-Origin-Embedder-Policy` headers required for `SharedArrayBuffer` builds. The script fetches a single-threaded build of `stockfish.js` and loads it from a same-origin `Blob` URL.
* **FEN extraction**: Reads `board.game.getFEN()` when exposed on `<wc-chess-board>`, or falls back to parsing `.piece` and `.square-XY` classes from the DOM.
* **Non-blocking overlay**: Appends a `position: fixed` SVG with `pointer-events: none` to `document.body` and aligns it to the board's `getBoundingClientRect()` coordinates. Appending inside `<wc-chess-board>` directly interferes with Chess.com's pointer handlers and blocks piece movement.

## License

MIT
