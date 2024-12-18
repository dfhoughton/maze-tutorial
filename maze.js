window.onload = () => {
  const maze = new Maze(document.getElementById("maze"));
  window.onkeydown = (e) => maze.keyDown(e.key);
};

class Maze {
  cells;
  start;
  finish;
  slow;
  state; // 'tunneling', 'paused', 'exploring', 'dead', 'escaped'
  player;
  monsters;
  constructor(table, options = { rows: 50 }) {
    let { rows, columns, slow, monsters } = options;
    rows ??= 50;
    columns ??= rows;
    monsters ??= 10;
    this.monsters = monsters; // initially a number, but later an array of Monsters
    this.slow = slow ?? false;
    this.state = "tunneling";
    // first we build all the cells
    const cells = (this.cells = []);
    for (let row = 0; row < rows; row++) {
      const tr = document.createElement("tr");
      const r = [];
      cells.push(r);
      table.appendChild(tr);
      for (let column = 0; column < columns; column++) {
        const td = document.createElement("td");
        td.innerHTML = "&nbsp;";
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
            if (maze.slow) yield false; // still tunneling
            queue.push(next);
          } else {
            queue.pop();
          }
        }
        if (maze.finish.done) break;
        if (
          !Object.entries(maze.finish.walls).some(([_side, status]) => !status)
        ) {
          // finnish is enclose by walls, break one wall
          const candidates = [];
          for (const side of Object.keys(maze.finish.walls)) {
            const other = maze.finish[side]();
            if (other) candidates.push(side);
          }
          const i = Math.floor(Math.random() * candidates.length);
          const side = candidates[i];
          maze.finish.digHole(side);
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
      }
      maze.state = "paused";
      maze.placePlayers();
      yield true;
    };
    // now we tunnel away
    const scoop = digger();
    const timer = setInterval(() => {
      if (scoop.next().value) clearInterval(timer);
    }, 0);
  }
  placePlayers() {
    this.player = new Person(this.start);
    const monsters = [];
    const availableCells = [];
    for (const row of this.cells) {
      for (const cell of row) {
        if (cell.unused() || cell === this.start) continue;
        availableCells.push(cell);
      }
    }
    for (let i = 0; i < this.monsters; i++) {
      if (availableCells.length) {
        const j = Math.floor(Math.random() * availableCells.length);
        const cell = availableCells.splice(j, 1)[0];
        monsters.push(new Monster(cell));
      } else {
        break;
      }
    }
    this.monsters = monsters;
    this.go();
  }
  go() {
    const maze = this;
    this.state = "tunneling";
    const play = function* () {
      while (true) {
        maze.monsters.forEach((m) => m.move());
        if (maze.done()) yield true;
        yield false;
      }
    };
    const iterator = play();
    const timer = setInterval(() => {
      if (iterator.next().value) {
        clearInterval(timer);
        console.log("done");
      } else {
        console.log("stepped");
      }
    }, 250);
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
  // restore a cell's contents to whatever it is without any occupants
  restore(cell) {
    if (cell === this.start) {
      cell.cell.innerText = "S";
    } else if (cell === this.finish) {
      cell.cell.innerText = "E";
    } else {
      cell.cell.innerHTML = "&nbsp;";
    }
  }
  escaped() {
    this.state = "escaped";
    this.player.cell.message("w00t!", true);
  }
  dead() {
    this.state = "dead";
    this.player.cell.message("Oh, noes!", false);
  }
  done() {
    return this.state === "escaped" || this.state === "dead";
  }
  keyDown(key) {
    if (this.state === "tunneling") {
      switch (key) {
        case "i":
        case "w":
        case "ArrowUp":
          this.player.move("top");
          break;
        case "s":
        case "k":
        case "ArrowDown":
          this.player.move("bottom");
          break;
        case "a":
        case "j":
        case "ArrowLeft":
          this.player.move("left");
          break;
        case "d":
        case "l":
        case "ArrowRight":
          this.player.move("right");
          break;
      }
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
  perpendicular(side) {
    switch (side) {
      case "top":
      case "bottom":
        return ["left", "right"];
      case "left":
      case "right":
        return ["top", "bottom"];
      default:
        throw `what kind of side is ${side}?`;
    }
  }
  /* is the being passing an opening? */
  temptations(direction) {
    if (!direction) return [];
    if (this.walls[direction]) return []; // if forward motion is blocked, this is irrelevant
    const openings = this.perpendicular(direction).filter(
      (w) => !this.walls[w]
    );
    if (openings.length) {
      const backwards = this.opposite(direction);
      const behind = this[backwards]();
      const ahead = this[direction]();
      return openings.filter((w) => {
        if (behind?.walls[w]) return true;
        if (ahead?.walls[w]) return true;
        // are we passing a tunnel opening?
        if (behind && ahead) {
          const beside = this[w]();
          if (beside && beside.walls[direction] && beside.walls[backwards])
            return true;
        }
        return false;
      });
    } else {
      return []; // no temptations
    }
  }
  hasMonster() {
    return this.cell.classList.contains("monster");
  }
  hasPerson() {
    return this.cell.classList.contains("person");
  }
  unused() {
    return this.cell.classList.contains("unused");
  }
  finish() {
    return this.cell.classList.contains("end");
  }
  message(msg, isGood) {
    this.cell.classList.add("message-anchor");
    const container = document.createElement("span");
    container.classList.add("message");
    container.classList.add(isGood ? "good" : "bad");
    container.innerText = msg;
    this.cell.appendChild(container);
  }
}

class Monster {
  cell;
  maze;
  direction;
  curiosity;
  constructor(cell, curiosity) {
    this.cell = cell;
    this.maze = cell.maze;
    this.curiosity = curiosity ?? 0.2 + Math.random();
    this.pickDirection();
    this.cell.cell.classList.add("monster");
    this.cell.cell.innerHTML = "&#x25cf;";
  }
  pickDirection() {
    const options = [];
    for (const [side, blocked] of Object.entries(this.cell.walls)) {
      if (blocked) continue;
      // monsters are blocked by other monsters
      if (this.cell[side]().cell.classList.contains("monster")) continue;
      options.push(side);
    }
    if (options.length === 0) {
      this.direction = null;
    } else if (options.length === 1) {
      this.direction = options[0];
    } else {
      const i = Math.floor(Math.random() * options.length);
      this.direction = options[i];
    }
  }
  move() {
    const temptations = this.cell.temptations(this.direction);
    if (temptations.length && Math.random() < this.curiosity) {
      if (temptations.length === 1) this.direction = temptations[0];
      else this.direction = temptations[Math.random() > 0.5 ? 0 : 1];
    }
    let c =
      this.direction &&
      !this.cell.walls[this.direction] &&
      this.cell[this.direction]();
    if (!c) {
      this.pickDirection();
      if (!this.direction) return; // could not move
      c = this.cell[this.direction]();
    }
    // move out of the current cell
    this.cell.cell.classList.remove("monster");
    this.maze.restore(this.cell);
    // move into the new cell
    this.cell = c;
    this.cell.cell.classList.add("monster");
    this.cell.cell.innerHTML = "&#x25cf;";
    // did the monster catch the person?
    if (this.cell.hasPerson()) this.maze.dead();
  }
}

class Person {
  cell;
  maze;
  constructor(cell) {
    this.cell = cell;
    this.maze = cell.maze;
    this.cell.cell.classList.add("person");
    this.cell.cell.innerHTML = "&#x25cf;";
  }
  move(side) {
    const c = this.cell[side]();
    if (!this.cell.walls[side] && c) {
      // move out of the current cell
      this.cell.cell.classList.remove("person");
      this.maze.restore(this.cell);
      // move into the new cell
      this.cell = c;
      this.cell.cell.classList.add("person");
      this.cell.cell.innerHTML = "&#x25cf;";
      // did the monster catch the person?
      if (this.cell.hasMonster()) {
        this.maze.dead();
      } else if (this.cell.finish()) {
        this.maze.escaped();
      }
    }
  }
}
