// ============================================================
//  BIRD ASSIGNMENT — no repeats until the roster is exhausted.
//
//  Hands out birds from a shuffled queue. When the queue empties,
//  it reshuffles the full roster and starts a new cycle. State is
//  persisted to data/assignments.json so uniqueness survives a
//  server restart.
//
//  SCALE CAVEAT: this is single-instance, file-backed state. It is
//  correct for one server. If you scale to multiple instances behind
//  a load balancer, move this to a shared store (Redis/Postgres),
//  or two instances will hand out the same bird.
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BIRD_IDS, getBird } from "./birds.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "assignments.json");

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { queue: shuffle(BIRD_IDS), cycle: 1, totalAssigned: 0 };
  }
}

function save(state) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

let state = load();

/** Assign the next bird. Returns the full bird object plus assignment meta. */
export function assignBird() {
  if (!state.queue || state.queue.length === 0) {
    state.queue = shuffle(BIRD_IDS);
    state.cycle = (state.cycle || 1) + 1;
  }
  const id = state.queue.shift();
  state.totalAssigned = (state.totalAssigned || 0) + 1;
  save(state);

  return {
    ...getBird(id),
    assignmentNumber: state.totalAssigned,
    cycle: state.cycle || 1,
    remainingThisCycle: state.queue.length,
  };
}

export function stats() {
  return {
    totalAssigned: state.totalAssigned || 0,
    cycle: state.cycle || 1,
    remainingThisCycle: state.queue?.length ?? 0,
    rosterSize: BIRD_IDS.length,
  };
}
