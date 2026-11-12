(() => {
  if (window.stopStockfish) window.stopStockfish();

  const CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';
  const SEARCH_DEPTH = 14;
  const POLL_MS = 800;

  let lastFen = '';
  let currentBestMove = null;
  let engine = null;
  let intervalId = null;

  function getBoardFEN() {
    const board = document.querySelector('wc-chess-board');
    if (!board) return null;

    if (board.game && typeof board.game.getFEN === 'function') {
      return board.game.getFEN();
    }

    const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
    const pieceMap = {
      wp: 'P', wn: 'N', wb: 'B', wr: 'R', wq: 'Q', wk: 'K',
      bp: 'p', bn: 'n', bb: 'b', br: 'r', bq: 'q', bk: 'k'
    };

    board.querySelectorAll('.piece').forEach((el) => {
      const classes = Array.from(el.classList);
      const piece = classes.find((c) => pieceMap[c]);
      const square = classes.find((c) => /^square-\d{2}$/.test(c));
      if (piece && square) {
        const digits = square.split('-')[1];
        const file = parseInt(digits[0], 10) - 1;
        const rank = 8 - parseInt(digits[1], 10);
        grid[rank][file] = pieceMap[piece];
      }
    });

    const rows = grid.map((row) => {
      let empty = 0;
      let str = '';
      for (const cell of row) {
        if (!cell) {
          empty++;
        } else {
          if (empty) {
            str += empty;
            empty = 0;
          }
          str += cell;
        }
      }
      if (empty) str += empty;
      return str;
    });

    const turn = board.game?.getTurn?.() === 2 ? 'b' : 'w';
    return `${rows.join('/')} ${turn} - - 0 1`;
  }

  function syncOverlayPosition() {
    const board = document.querySelector('wc-chess-board');
    const svg = document.getElementById('sf-overlay');
    if (!board || !svg) return;

    const rect = board.getBoundingClientRect();
    Object.assign(svg.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  }

  function drawBestMove(uciMove) {
    const board = document.querySelector('wc-chess-board');
    if (!board || !uciMove || uciMove === '(none)') return;

    document.getElementById('sf-overlay')?.remove();

    const isFlipped = board.classList.contains('flipped');
    const sqToCoords = (sq) => {
      const file = sq.charCodeAt(0) - 97;
      const rank = parseInt(sq[1], 10) - 1;
      const col = isFlipped ? 7 - file : file;
      const row = isFlipped ? rank : 7 - rank;
      return { x: col * 12.5, y: row * 12.5 };
    };

    const from = sqToCoords(uciMove.slice(0, 2));
    const to = sqToCoords(uciMove.slice(2, 4));

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'sf-overlay';
    svg.setAttribute('viewBox', '0 0 100 100');
    Object.assign(svg.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '99999'
    });

    svg.innerHTML = `
      <defs>
        <marker id="sf-arrowhead" markerWidth="4" markerHeight="4" refX="2.5" refY="2" orient="auto">
          <polygon points="0 0, 4 2, 0 4" fill="rgba(0, 220, 130, 0.88)" />
        </marker>
      </defs>
      <rect x="${from.x}" y="${from.y}" width="12.5" height="12.5" fill="rgba(0, 220, 130, 0.28)" />
      <rect x="${to.x}" y="${to.y}" width="12.5" height="12.5" fill="rgba(0, 220, 130, 0.42)" />
      <line x1="${from.x + 6.25}" y1="${from.y + 6.25}"
            x2="${to.x + 6.25}" y2="${to.y + 6.25}"
            stroke="rgba(0, 220, 130, 0.88)"
            stroke-width="2.2"
            stroke-linecap="round"
            marker-end="url(#sf-arrowhead)" />
    `;

    document.body.appendChild(svg);
    syncOverlayPosition();
  }

  async function init() {
    const res = await fetch(CDN_URL);
    const blob = new Blob([await res.text()], { type: 'application/javascript' });
    engine = new Worker(URL.createObjectURL(blob));

    engine.onmessage = (e) => {
      const line = e.data;
      if (line.startsWith('bestmove')) {
        currentBestMove = line.split(' ')[1];
        console.log(`%cBest move: ${currentBestMove}`, 'color: #00dc82; font-weight: bold;');
        drawBestMove(currentBestMove);
      }
    };

    engine.postMessage('uci');

    intervalId = setInterval(() => {
      const fen = getBoardFEN();
      if (!fen || fen === lastFen) return;

      lastFen = fen;
      currentBestMove = null;
      document.getElementById('sf-overlay')?.remove();
      engine.postMessage('stop');
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage(`go depth ${SEARCH_DEPTH}`);
    }, POLL_MS);

    window.addEventListener('resize', syncOverlayPosition);
    window.addEventListener('scroll', syncOverlayPosition, true);

    window.stopStockfish = () => {
      clearInterval(intervalId);
      window.removeEventListener('resize', syncOverlayPosition);
      window.removeEventListener('scroll', syncOverlayPosition, true);
      engine?.terminate();
      document.getElementById('sf-overlay')?.remove();
      console.log('Stockfish stopped and overlay removed.');
    };

    console.log('Stockfish polling active. Run stopStockfish() to stop.');
  }

  init().catch((err) => console.error('Failed to start Stockfish:', err));
})();
