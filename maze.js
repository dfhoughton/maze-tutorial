// putting these parameters here so they're easy to find and tinker with
const defaultConfiguration = {
  rows: 40,
  slow: true,
  monsters: 10,
  speed: 250, // delay between monster moves
  minStartDistance: 16, //vertical and horizontal distance between start space and end space
};

/* some utility functions */

// pick a random whole number between 0 and topOfRange inclusive
function randy(topOfRange) {
  return Math.floor(Math.random() * topOfRange);
}
// pick a random item from the list
function pickFrom(list) {
  if (list.length === 1) return list[0];
  return list[randy(list.length)];
}
// fix position of a monster/person span relative to its containing cell
function center(td) {
  const { width: outerWidth, height: outerHeight } = td.getBoundingClientRect();
  const being = td.children[0]; // the span
  const { width: innerWidth, height: innerHeight } =
    being.getBoundingClientRect();
  const top = (outerHeight - innerHeight) / 2;
  const left = (outerWidth - innerWidth) / 2;
  being.setAttribute("style", `top: ${top}px; left: ${left}px`);
}
// converts a base direction of an image and a direction of movement to a CSS class
// which will rotate the base image correctly to appear to be moving in that direction
function orient(baseDirection, directionOfMovement) {
  switch (baseDirection) {
    case "top":
      switch (directionOfMovement) {
        case "top":
          return "left"; // does nothing
        case "bottom":
          return "flip";
        case "left":
          return "bottom";
        case "right":
          return "top";
        default:
          throw `how did we get direction ${directionOfMovement}?!`;
      }
    case "bottom":
      switch (directionOfMovement) {
        case "top":
          return "flip";
        case "bottom":
          return "left"; // does nothing
        case "left":
          return "top";
        case "right":
          return "bottom";
        default:
          throw `how did we get direction ${directionOfMovement}?!`;
      }
    case "left": // the default direction
      return directionOfMovement;
    case "right":
      switch (directionOfMovement) {
        case "top":
          return "bottom";
        case "bottom":
          return "top";
        case "left":
          return "right";
        case "right":
          return "left";
        default:
          throw `how did we get direction ${directionOfMovement}?!`;
      }
    default:
      throw `how did we get direction ${baseDirection}?!`;
  }
}

// wire things together as soon as we can
window.onload = () => {
  // the thing that will hold the maze
  const m = document.getElementById("maze");
  // some buttons to control it
  const start = document.getElementById("start");
  const go = document.getElementById("go");
  const tunnel = document.getElementById("tunnel");
  const insta = document.getElementById("insta-maze");
  const pause = document.getElementById("pause");
  // the maze
  const maze = new Maze(m, { start, go, tunnel, insta, pause });
  // modal
  const present = document.getElementById("present");
  const modal = document.getElementById("modal");
  const closer = document.getElementById("close-modal");
  function mode(on) {
    if (on) {
      modal.style.display = "block";
      maze.modalOn();
    } else {
      modal.style.display = "none";
      maze.modalOff();
    }
  }
  present.onclick = () => {
    mode(true);
  };
  closer.onclick = () => mode(false);
  // click handler
  window.onclick = (event) => {
    if (event.target == modal) mode(false);
  };
  // keypress handler
  window.onkeydown = (event) => {
    if (event.key === "Escape" && maze.state === "modal") {
      mode(false);
    } else {
      maze.keyDown(event.key);
    }
  };
};

class Maze {
  table;
  rows;
  columns;
  cells;
  start;
  finish;
  slow;
  speed;
  state; // 'tunneling', 'paused', 'exploring', 'dead', 'escaped', 'modal'
  player;
  monsterCount;
  monsters;
  buttons;
  suspendedState;
  minStartDistance;
  constructor(table, buttons, options = {}) {
    this.table = table;
    // the defaults
    const {
      rows,
      columns = rows,
      slow,
      monsters,
      speed,
      minStartDistance,
    } = { ...defaultConfiguration, ...options };
    this.rows = rows;
    this.columns = columns;
    this.monsterCount = monsters;
    this.speed = speed;
    this.monsters = [];
    this.cells = [];
    this.slow = slow;
    this.buttons = buttons;
    this.minStartDistance = minStartDistance;
    this.initializeMaze();
    this.initializeButtons();
  }
  initializeMaze() {
    // clear everything
    this.state = "paused";
    Array.from(this.table.children).forEach((c) => this.table.removeChild(c));
    this.cells.length = 0;
    this.monsters.length = 0;
    // first we build all the cells
    const cells = this.cells;
    for (let row = 0; row < this.rows; row++) {
      const tr = document.createElement("tr");
      const r = [];
      cells.push(r);
      this.table.appendChild(tr);
      for (let column = 0; column < this.columns; column++) {
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
    s.td.classList.add("start");
    s.td.innerText = "S";
    // make sure you don't accidentally make the start also the finish
    let e = s;
    while (e.manhattanDistanceFrom(s) < this.minStartDistance) {
      e = this.randomCell();
    }
    this.finish = e;
    e.td.classList.add("end");
    e.td.innerText = "E";
  }
  initializeButtons() {
    const { start, go, tunnel, insta, pause } = this.buttons;
    start.disabled = false;
    tunnel.disabled = false;
    insta.disabled = false;
    start.onclick = () => {
      go.disabled = true;
      pause.disabled = true;
      this.initializeMaze();
      tunnel.disabled = false;
      insta.disabled = false;
    };
    tunnel.onclick = () => {
      start.disabled = true;
      insta.disabled = true;
      this.slow = true;
      this.tunnel(() => {
        this.placePlayers();
        start.disabled = false;
        tunnel.disabled = true;
        go.disabled = false;
        go.focus();
      });
    };
    insta.onclick = () => {
      start.disabled = true;
      tunnel.disabled = true;
      this.slow = false;
      this.tunnel(() => {
        this.placePlayers();
        start.disabled = false;
        insta.disabled = true;
        go.disabled = false;
        go.focus();
      });
    };
    go.onclick = () => {
      this.go();
      pause.disabled = false;
      go.disabled = true;
    };
    pause.onclick = () => {
      if (this.state === "paused") {
        pause.innerText = "Pause";
        this.state = "exploring";
      } else {
        pause.innerText = "Resume";
        this.state = "paused";
      }
    };
  }
  tunnel(callback) {
    // initialize branchiness probabilities
    this.state = "tunneling";
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
    // a generator function! (note the asterisk and the "yield"s)
    // this allows us to generate the labyrinth one step at a time allowing
    // the browser to redraw in the pause between steps
    // the generator returns true to indicate it is done and false otherwise
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
          maze.finish.digHole(pickFrom(candidates));
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
          const candidate = pickFrom(candidates);
          const sides = [];
          for (const [side, blocked] of Object.entries(candidate.walls)) {
            if (!blocked) continue;
            const c = candidate[side]();
            if (c && !c.done) sides.push(side);
          }
          if (sides.length) {
            const side = pickFrom(sides);
            candidate.digHole(side);
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
      if (scoop.next().value) {
        clearInterval(timer);
        callback();
      }
    }, 0);
  }
  placePlayers() {
    this.player = new Person(this.start);
    const availableCells = [];
    for (const row of this.cells) {
      for (const cell of row) {
        if (cell.unused() || cell === this.start) continue;
        availableCells.push(cell);
      }
    }
    for (let i = 0; i < this.monsterCount; i++) {
      if (availableCells.length) {
        const j = randy(availableCells.length);
        const cell = availableCells.splice(j, 1)[0];
        this.monsters.push(new Monster(cell));
      } else {
        break;
      }
    }
  }
  // begin play
  go() {
    const maze = this;
    this.state = "exploring";
    // another generator function, which allows the maze to react to
    // player actions between monster movements
    const play = function* () {
      while (true) {
        if (maze.state === "exploring") {
          maze.monsters.forEach((m) => m.move());
          if (maze.done()) yield true;
        }
        yield false;
      }
    };
    const iterator = play();
    const timer = setInterval(() => {
      if (iterator.next().value) {
        clearInterval(timer);
      }
    }, this.speed);
  }
  randomCell() {
    const x = Math.floor(Math.random() * (this.cells[0]?.length ?? 0));
    const y = randy(this.cells.length);
    return this.cell(x, y);
  }
  bottomRow(row) {
    return row === this.cells.length - 1;
  }
  rightmostColumn(column) {
    return column === (this.cells[0]?.length ?? 0) - 1;
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
      cell.td.innerText = "S";
    } else if (cell === this.finish) {
      cell.td.innerText = "E";
    } else {
      cell.td.innerHTML = "&nbsp;";
    }
  }
  escaped() {
    this.state = "escaped";
    this.player.cell.message("w00t!", true);
    const { pause } = this.buttons;
    pause.disabled = true;
  }
  dead() {
    this.state = "dead";
    this.player.cell.td.innerHTML = '<span class="splat"> 💥 </span>';
    center(this.player.cell.td);
    this.player.cell.message("Oh, noes!", false);
    const { pause } = this.buttons;
    pause.disabled = true;
  }
  done() {
    return this.state === "escaped" || this.state === "dead";
  }
  keyDown(key) {
    if (this.state === "exploring") {
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
  modalOn() {
    this.suspendedState = this.state;
    this.state = "modal";
  }
  modalOff() {
    this.state = this.suspendedState;
    this.suspendedState = undefined;
  }
}

class Cell {
  maze;
  td;
  row;
  column;
  walls;
  done;
  constructor(maze, cell, row, column) {
    this.maze = maze;
    this.td = cell;
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
    this.td.classList.remove("unused");
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
        const whichWall = randy(availableWalls.length);
        const side = availableWalls.splice(whichWall, 1)[0];
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
    if (available.length) return pickFrom(available);
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
    this.td.classList.add(side);
    const other = this[side]();
    if (other) {
      const oppositeSide = this.opposite(side);
      other.walls[oppositeSide] = true;
      other.td.classList.add(oppositeSide);
    }
  }
  digHole(side) {
    this.walls[side] = false;
    this.td.classList.add(`no-${side}`);
    const other = this[side]();
    if (other) {
      const oppositeSide = this.opposite(side);
      other.walls[oppositeSide] = false;
      other.td.classList.add(`no-${oppositeSide}`);
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
    return this.td.classList.contains("monster");
  }
  hasPerson() {
    return this.td.classList.contains("person");
  }
  unused() {
    return this.td.classList.contains("unused");
  }
  finish() {
    return this.td.classList.contains("end");
  }
  message(msg, isGood) {
    this.td.classList.add("message-anchor");
    const container = document.createElement("span");
    container.classList.add("message");
    container.classList.add(isGood ? "good" : "bad");
    container.innerText = msg;
    this.td.appendChild(container);
  }
  manhattanDistanceFrom(otherCell) {
    const verticalDistance = Math.abs(this.row - otherCell.row);
    const horizontalDistance = Math.abs(this.column - otherCell.column);
    return verticalDistance + horizontalDistance;
  }
}

// various monstrous emojis found at https://emojigraph.org/
// each item in the array pairs the HTML entity codes for the emoji to the direction it's facing
// we want the direction so we can rotate the emojis to face their direction of movement
// if they're facing forward, I just say they're facing left -- it works
const monsterEmojis = [
  ["&#x1f47a;", "right"], // red Japanese goblin
  ["&#x1f98e;", "top"], // lizard
  ["&#x1F9DF;&#x200D;&#x2640;&#xFE0F;", "left"], // female zombie
  ["&#x1F9CC;", "left"], // troll
  ["&#x1F577;&#xFE0F;", "top"], // spider
  ["&#x1F40C;", "right"], // snail
];

class Monster {
  cell; // the Cell object containing the monster in the maze
  maze; // the Maze object containing the monster
  direction; // the direction the monster is currently moving -- left, right, top, bottom
  curiosity; // how likely the monster is to exploring openings it passes
  baseDirection; // the way the monster image is facing without any rotation applied
  image; // a snippet of HTML which renders the monster in the maze
  constructor(cell, curiosity) {
    this.cell = cell;
    this.maze = cell.maze;
    this.curiosity = curiosity ?? 0.2 + Math.random();
    const [emoji, baseDirection] = pickFrom(monsterEmojis);
    this.baseDirection = baseDirection;
    this.image = `<span>${emoji}</span>`;
    this.pickDirection();
    this.cell.td.classList.add("monster");
    this.cell.td.innerHTML = this.image;
    this.center();
  }
  center() {
    center(this.cell.td);
  }
  pickDirection() {
    const options = [];
    for (const [side, blocked] of Object.entries(this.cell.walls)) {
      if (blocked) continue;
      // monsters are blocked by other monsters
      if (this.cell[side]().td.classList.contains("monster")) continue;
      options.push(side);
    }
    if (options.length === 0) {
      this.direction = null;
    } else this.direction = pickFrom(options);
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
    this.cell.td.classList.remove("monster");
    this.maze.restore(this.cell);
    // move into the new cell
    this.cell = c;
    this.cell.td.classList.add("monster");
    this.cell.td.innerHTML = this.image;
    // make the monster face the direction it's moving
    if (this.direction)
      this.cell.td.children[0].classList.add(
        orient(this.baseDirection, this.direction)
      );
    this.center();
    // did the monster catch the person?
    if (this.cell.hasPerson()) this.maze.dead();
  }
}

// works like the monsterEmojis array but for people
const people = [
  ["&#x1F3C3;&#x1F3FF;&#x200D;&#x2640;&#xFE0F;", "left"], // dark-skinned woman running
  ["&#x1F483;", "right"], // woman dancing
  ["&#x1F93A;", "left"], // fencer
  ["&#x1F6B4;&#x200D;&#x2640;&#xFE0F;", "left"], // woman biking
];

class Person {
  cell;
  maze;
  image;
  constructor(cell) {
    this.cell = cell;
    this.maze = cell.maze;
    this.cell.td.classList.add("person");
    const [emoji, baseDirection] = pickFrom(people);
    this.baseDirection = baseDirection;
    this.image = `<span>${emoji}</span`;
    this.cell.td.innerHTML = this.image;
    this.center();
  }
  center() {
    center(this.cell.td);
  }
  move(side) {
    const c = this.cell[side]();
    if (!this.cell.walls[side] && c) {
      // move out of the current cell
      this.cell.td.classList.remove("person");
      this.maze.restore(this.cell);
      // move into the new cell
      this.cell = c;
      this.cell.td.classList.add("person");
      this.cell.td.innerHTML = this.image;
      this.cell.td.children[0].classList.add(orient(this.baseDirection, side));
      this.center();
      // did the monster catch the person?
      if (this.cell.hasMonster()) {
        this.maze.dead();
      } else if (this.cell.finish()) {
        this.maze.escaped();
      }
    }
  }
}
