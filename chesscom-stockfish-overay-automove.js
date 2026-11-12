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
      const p = classes.find((c) => pieceMap[c]);
      const sq = classes.find((c) => /^square-\d{2}$/.test(c));
      if (p && sq) {
        const digits = sq.split('-')[1];
        const file = parseInt(digits[0], 10) - 1;
        const rank = 8 - parseInt(digits[1], 10);
        grid[rank][file] = pieceMap[p];
      }
    });

    const rows = grid.map((row) => {
      let empty = 0;
      let str = '';
      for (const cell of row) {
        if (!cell) empty++;
        else {
          if (empty) { str += empty; empty = 0; }
          str += cell;
        }
      }
      if (empty) str += empty;
      return str;
    });

    const turn = board.game?.getTurn?.() === 2 ? 'b' : 'w';
    return `${rows.join('/')} ${turn} - - 0 1`;
  }

  function isMyTurn(fen) {
    const board = document.querySelector('wc-chess-board');
    if (!board || !fen) return false;
    const myColor = board.classList.contains('flipped') ? 'b' : 'w';
    const activeTurn = fen.split(' ')[1];
    return myColor === activeTurn;
  }

  function getSquareCenter(board, sq) {
    const rect = board.getBoundingClientRect();
    const isFlipped = board.classList.contains('flipped');
    const file = sq.charCodeAt(0) - 97;
    const rank = parseInt(sq[1], 10) - 1;
    const col = isFlipped ? 7 - file : file;
    const row = isFlipped ? rank : 7 - rank;
    const sqSize = rect.width / 8;

    return {
      x: rect.left + (col + 0.5) * sqSize,
      y: rect.top + (row + 0.5) * sqSize
    };
  }

  function clickSquare(board, sq) {
    const { x, y } = getSquareCenter(board, sq);
    const target = document.elementFromPoint(x, y) || board;
    const eventOpts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1
    };

    target.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
    target.dispatchEvent(new MouseEvent('mousedown', eventOpts));
    target.dispatchEvent(new PointerEvent('pointerup', { ...eventOpts, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...eventOpts, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('click', { ...eventOpts, buttons: 0 }));
  }

  function makeMove(uciMove) {
    const board = document.querySelector('wc-chess-board');
    if (!board || !uciMove || uciMove === '(none)') return;

    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove[4] || undefined;

    if (board.game && typeof board.game.move === 'function') {
      const moved = board.game.move({ from, to, promotion, animate: true });
      if (moved) return;
    }

    clickSquare(board, from);
    setTimeout(() => {
      clickSquare(board, to);
      if (promotion) {
        setTimeout(() => {
          const color = board.classList.contains('flipped') ? 'b' : 'w';
          const promoEl = document.querySelector(`.promotion-piece.${color}${promotion}`);
          promoEl?.click();
        }, 120);
      }
    }, 80);
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

  function onKeyDown(e) {
    if (e.key !== 'Enter') return;

    // Ignore Enter when typing inside inputs or chat boxes
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
      return;
    }

    if (currentBestMove && isMyTurn(lastFen)) {
      e.preventDefault();
      const moveToPlay = currentBestMove;
      currentBestMove = null; // Prevent double-firing on held Enter
      makeMove(moveToPlay);
    }
  }

  async function init() {
    const res = await fetch(CDN_URL);
    const blob = new Blob([await res.text()], { type: 'application/javascript' });
    engine = new Worker(URL.createObjectURL(blob));

    engine.onmessage = (e) => {
      const line = e.data;
      if (line.startsWith('bestmove')) {
        currentBestMove = line.split(' ')[1];
        console.log(`%cBest move: ${currentBestMove} (Press Enter to play)`, 'color: #00dc82; font-weight: bold;');
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

      if (!isMyTurn(fen)) return;

      engine.postMessage('stop');
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage(`go depth ${SEARCH_DEPTH}`);
    }, POLL_MS);

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', syncOverlayPosition);
    window.addEventListener('scroll', syncOverlayPosition, true);

    window.stopStockfish = () => {
      clearInterval(intervalId);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', syncOverlayPosition);
      window.removeEventListener('scroll', syncOverlayPosition, true);
      engine?.terminate();
      document.getElementById('sf-overlay')?.remove();
      console.log('Stockfish stopped.');
    };

    console.log('Stockfish active. Press Enter to execute the highlighted move, or run stopStockfish() to stop.');
  }

  init().catch((err) => console.error('Failed to start Stockfish:', err));
})();
