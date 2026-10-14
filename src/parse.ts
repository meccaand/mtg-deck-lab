export type Board = "main" | "side" | "commander";

export interface Entry {
  qty: number;
  name: string;
  set?: string;
  num?: string;
  board: Board;
}

const HEADER = /^(commander|companion|deck|main(?:deck)?|sideboard|side)\s*:?$/i;
const HEADER_PREFIX = /^(commander|companion|deck|main(?:deck)?|sideboard|side)\s*:?\s+(?=\d)/i;
// One "<qty> <name>" token; the name runs until the next " <qty> <Capital|quote>" so
// decklists that were flattened onto a single line still parse.
const TOKEN = /(\d+)x?\s+(.+?)(?=\s+\d+x?\s+["'A-Z]|$)/g;
const SUFFIX = /\s+\(([A-Za-z0-9]+)\)\s+(\S+)$/;

function boardFor(header: string): Board | "ignore" {
  const h = header.toLowerCase();
  if (h === "commander") return "commander";
  if (h === "companion") return "ignore";
  if (h.startsWith("side")) return "side";
  return "main";
}

/** Parse Arena / MTGO / plain-text decklists (including flattened single-line ones). */
export function parseDeck(text: string): Entry[] {
  const entries: Entry[] = [];
  let board: Board | "ignore" = "main";
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;
    const prefix = line.match(HEADER_PREFIX);
    if (prefix) {
      board = boardFor(prefix[1]);
      line = line.slice(prefix[0].length);
    } else if (HEADER.test(line)) {
      board = boardFor(line.replace(/\s*:$/, ""));
      continue;
    }
    if (board === "ignore") continue;
    for (const m of line.matchAll(TOKEN)) {
      let name = m[2].trim();
      let set: string | undefined;
      let num: string | undefined;
      const s = name.match(SUFFIX);
      if (s) {
        set = s[1].toLowerCase();
        num = s[2];
        name = name.slice(0, s.index).trim();
      }
      entries.push({ qty: Number(m[1]), name, set, num, board });
    }
  }
  return mergeDuplicates(entries);
}

export function mergeDuplicates(entries: Entry[]): Entry[] {
  const out: Entry[] = [];
  for (const e of entries) {
    const hit = out.find((o) => o.board === e.board && o.name.toLowerCase() === e.name.toLowerCase());
    if (hit) hit.qty += e.qty;
    else out.push({ ...e });
  }
  return out;
}

/** Arena-importable text. */
export function toArenaText(entries: Entry[]): string {
  const block = (board: Board) =>
    entries.filter((e) => e.board === board).map((e) => `${e.qty} ${e.name}`).join("\n");
  const parts: string[] = [];
  if (entries.some((e) => e.board === "commander")) parts.push(`Commander\n${block("commander")}`);
  parts.push(`Deck\n${block("main")}`);
  if (entries.some((e) => e.board === "side")) parts.push(`Sideboard\n${block("side")}`);
  return parts.join("\n\n");
}
