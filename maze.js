window.onload = () => {
  new Maze(document.getElementById("maze"));
};

class Maze {
  cells;
  start;
  finish;
  constructor(table, rows = 60, columns = rows) {
    // first we build all the cells
    const cells = (this.cells = []);
    for (let row = 0; row < rows; row++) {
      const tr = document.createElement("tr");
      const r = [];
      cells.push(r);
      table.appendChild(tr);
      for (let column = 0; column < columns; column++) {
        const td = document.createElement("td");
        td.classList.add("unused"); // initially everything is unused
        tr.appendChild(td);
        r.push(new Cell(this, td, row, column));
      }
    }
    // then we initialize them
    for (const row of cells) {
      for (const cell of row) {
        cell.init();
      }
    }
    // pick start and finish cells
    const s = (this.start = this.randomCell());
    s.cell.classList.add("start");
    s.cell.innerText = "S";
    const e = (this.finish = this.randomCell());
    e.cell.classList.add("end");
    e.cell.innerText = "E";
    this.tunnel();
  }
  tunnel() {
    // initialize branchiness probabilities
    let t1 = Math.random();
    t1 = t1 + (1 - t1) * Math.random(); // the two branch state gets an extra helping of probability
    const t2 = t1 + (1 - t1) * Math.random();
    const t3 = t2 + (1 - t2) * Math.random();
    const holeCount = function () {
      const p = Math.random();
      if (p < t1) return 2;
      if (p < t2) return 3;
      if (p < t3) return 4;
      return 1;
    };
    // how we will tunnel
    const maze = this;
    const digger = function* () {
      maze.start.knockOutTheWalls(holeCount());
      const queue = [maze.start];
      while (true) {
        while (queue.length) {
          const head = queue[queue.length - 1];
          const next = head.pickNextCell();
          if (next) {
            next.knockOutTheWalls(holeCount());
            yield false; // still tunneling
            queue.push(next);
          } else {
            queue.pop();
          }
        }
        if (maze.finish.done) break;
        if (
          !Object.entries(maze.finish.walls).some(([_side, status]) => !status)
        ) {
          // end is enclose by walls, break one wall
          const candidates = [];
          for (const side of Object.keys(maze.end.walls)) {
            const other = maze.end[side]();
            if (other) candidates.push(side);
          }
          const i = Math.floor(Math.random() * candidates.length);
          const side = candidates[i];
          maze.end.digHole(side);
          break;
        }
        // scan for a cell that has unused neighbors and start tunneling there
        const candidates = [];
        for (const row of maze.cells) {
          for (const c of row) {
            if (c.done) {
              if (
                Object.keys(c.walls).some((s) => {
                  const o = c[s]();
                  return o && !o.done;
                })
              )
                candidates.push(c);
            }
          }
        }
        // now pick a candidate
        if (candidates.length) {
          let candidate;
          if (candidates.length === 1) {
            candidate = candidates[0];
          } else {
            const i = Math.floor(Math.random() * candidates.length);
            candidate = candidates[i];
          }
          const sides = [];
          for (const [side, blocked] of Object.entries(candidate.walls)) {
            if (!blocked) continue;
            const c = candidate[side]();
            if (c && !c.done) sides.push(side);
          }
          if (sides.length) {
            if (sides.length === 1) {
              candidate.digHole(sides[0]);
            } else {
              const i = Math.floor(Math.random() * sides.length);
              candidate.digHole(sides[i]);
            }
            queue.push(candidate);
            continue;
          } else {
            // we should never get here
            console.error("could not find a way to connect start to finish");
            break;
          }
        } else {
          break;
        }
        yield true; // done tunneling
      }
    };
    // now we tunnel away
    const scoop = digger();
    const timer = setInterval(() => {
      if (scoop.next().value) clearInterval(timer);
    }, 0);
  }
  randomCell() {
    const x = Math.floor(Math.random() * (this.cells[0]?.length ?? 0));
    const y = Math.floor(Math.random() * this.cells.length);
    return this.cell(x, y);
  }
  bottomRow(row) {
    return row === this.cells.length - 1;
  }
  rightmostColumn(column) {
    return column === this.cells[0]?.length - 1;
  }
  cell(x, y) {
    if (x >= 0 && y >= 0) {
      const row = this.cells[y];
      if (row) return row[x];
    }
  }
}

class Cell {
  maze;
  cell;
  row;
  column;
  walls;
  done;
  constructor(maze, cell, row, column) {
    this.maze = maze;
    this.cell = cell;
    this.row = row;
    this.column = column;
    this.walls = { top: null, bottom: null, left: null, right: null };
    this.done = false;
  }
  // to be run after the maze has finished adding all its cells
  init() {
    if (this.isInTopRow()) this.buildWall("top");
    if (this.isInBottom()) this.buildWall("bottom");
    if (this.isInLeftmostRow()) this.buildWall("left");
    if (this.isInRightmostRow()) this.buildWall("right");
  }
  isInTopRow() {
    return this.row === 0;
  }
  isInBottom() {
    return this.maze.bottomRow(this.row);
  }
  isInLeftmostRow() {
    return this.column === 0;
  }
  isInRightmostRow() {
    return this.maze.rightmostColumn(this.column);
  }
  knockOutTheWalls(desiredHoles) {
    this.done = true;
    this.cell.classList.remove("unused");
    let availableWalls = [];
    let holeCount = 0;
    for (const [k, v] of Object.entries(this.walls)) {
      if (v === null) {
        availableWalls.push(k);
      } else if (!v) {
        holeCount += 1;
      }
    }
    if (!availableWalls.length) return;
    if (availableWalls.length === desiredHoles) {
      for (const side of availableWalls) {
        this.digHole(side);
      }
    } else {
      while (availableWalls.length && holeCount < desiredHoles) {
        const i = Math.floor(Math.random() * availableWalls.length);
        const side = availableWalls.splice(i, 1)[0];
        this.digHole(side);
        holeCount += 1;
      }
      // where we didn't put in holes we put up walls
      for (const side of availableWalls) {
        this.buildWall(side);
      }
    }
  }
  // randomly pick the next direction to start tunneling
  pickNextCell() {
    const available = [];
    for (const [side, isWall] of Object.entries(this.walls)) {
      if (!isWall) {
        const c = this[side]();
        if (c && !c.done) available.push(c);
      }
    }
    if (available.length) {
      if (available.length === 1) return available[0];
      const i = Math.floor(Math.random() * available.length);
      return available[i];
    }
  }
  // some methods to get useful neighbors
  left() {
    return this.maze.cell(this.column - 1, this.row);
  }
  right() {
    return this.maze.cell(this.column + 1, this.row);
  }
  top() {
    return this.maze.cell(this.column, this.row - 1);
  }
  bottom() {
    return this.maze.cell(this.column, this.row + 1);
  }
  buildWall(side) {
    this.walls[side] = true;
    this.cell.classList.add(side);
    const other = this[side]();
    if (other) {
      const oppositeSide = this.opposite(side);
      other.walls[oppositeSide] = true;
      other.cell.classList.add(oppositeSide);
    }
  }
  digHole(side) {
    this.walls[side] = false;
    this.cell.classList.add(`no-${side}`);
    const other = this[side]();
    if (other) {
      const oppositeSide = this.opposite(side);
      other.walls[oppositeSide] = false;
      other.cell.classList.add(`no-${oppositeSide}`);
    }
  }
  opposite(side) {
    switch (side) {
      case "top":
        return "bottom";
      case "bottom":
        return "top";
      case "left":
        return "right";
      case "right":
        return "left";
      default:
        throw `where did side ${side} come from???`;
    }
  }
}
