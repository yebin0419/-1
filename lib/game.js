export const DIFFICULTY = {
  easy:   { rows: 9,  cols: 9,  mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard:   { rows: 16, cols: 30, mines: 99 },
};

export class Minesweeper {
  constructor(difficulty) {
    this.config = DIFFICULTY[difficulty];
    this.difficulty = difficulty;
    this.reset();
  }

  reset() {
    const { rows, cols } = this.config;
    this.board = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        mine: false,
        open: false,
        flag: false,
        count: 0,
      }))
    );
    this.minesPlaced = false;
    this.flagsUsed = 0;
    this.openedCount = 0;
    this.state = "ready";
    this.startTime = null;
    this.endTime = null;
  }

  placeMines(excludeR, excludeC) {
    const { rows, cols, mines } = this.config;
    const forbidden = new Set();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = excludeR + dr, nc = excludeC + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          forbidden.add(nr * cols + nc);
        }
      }
    }
    let placed = 0;
    while (placed < mines) {
      const idx = Math.floor(Math.random() * rows * cols);
      if (forbidden.has(idx)) continue;
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      if (this.board[r][c].mine) continue;
      this.board[r][c].mine = true;
      placed++;
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.board[r][c].mine) continue;
        let cnt = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && this.board[nr][nc].mine) {
              cnt++;
            }
          }
        }
        this.board[r][c].count = cnt;
      }
    }
    this.minesPlaced = true;
  }

  open(r, c) {
    if (this.state === "won" || this.state === "lost") return;
    const cell = this.board[r][c];
    if (cell.open || cell.flag) return;

    if (!this.minesPlaced) {
      this.placeMines(r, c);
      this.state = "playing";
      this.startTime = Date.now();
    }

    if (cell.mine) {
      cell.open = true;
      this.state = "lost";
      this.endTime = Date.now();
      this.revealAllMines();
      return;
    }

    this.flood(r, c);
    this.checkWin();
  }

  flood(r, c) {
    const { rows, cols } = this.config;
    const stack = [[r, c]];
    while (stack.length) {
      const [cr, cc] = stack.pop();
      const cell = this.board[cr][cc];
      if (cell.open || cell.flag || cell.mine) continue;
      cell.open = true;
      this.openedCount++;
      if (cell.count === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = cr + dr, nc = cc + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              stack.push([nr, nc]);
            }
          }
        }
      }
    }
  }

  toggleFlag(r, c) {
    if (this.state === "won" || this.state === "lost") return;
    const cell = this.board[r][c];
    if (cell.open) return;
    cell.flag = !cell.flag;
    this.flagsUsed += cell.flag ? 1 : -1;
  }

  revealAllMines() {
    for (const row of this.board) {
      for (const cell of row) {
        if (cell.mine) cell.open = true;
      }
    }
  }

  checkWin() {
    const { rows, cols, mines } = this.config;
    const total = rows * cols;
    if (this.openedCount === total - mines) {
      this.state = "won";
      this.endTime = Date.now();
    }
  }

  getElapsedSeconds() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return Math.floor((end - this.startTime) / 1000);
  }

  getRemainingMines() {
    return this.config.mines - this.flagsUsed;
  }

  computeScore() {
    const weight = { easy: 1, medium: 3, hard: 7 }[this.difficulty];
    const t = this.getElapsedSeconds();
    return Math.max(1, Math.round((weight * 1000) / (t + 10)));
  }
}
