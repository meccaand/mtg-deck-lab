import type { FormatDef } from "./formats";
import type { Entry } from "./parse";
import { fullText, key, manaCost, type Card } from "./scryfall";

export type Level = "error" | "warn" | "info" | "ok";
export interface Issue {
  level: Level;
  msg: string;
  cards?: string[];
}

export interface Row {
  entry: Entry;
  card?: Card;
  tags: string[];
}

export interface Report {
  rows: Row[];
  issues: Issue[];
  total: number;
  lands: number;
  avgCmc: number;
  curve: number[];
  types: Record<string, number>;
  noncreatureShare: number;
  pips: Record<string, number>;
  sources: Record<string, number>;
  tags: Record<string, number>;
  gameChangers: string[];
}

export const COLORS = ["W", "U", "B", "R", "G"] as const;
const TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"];

/** Rough role tags from Oracle text. Heuristic: use them to spot gaps, not as ground truth. */
const TAG_RULES: [string, RegExp][] = [
  ["ramp", /add \{[WUBRGC]|search your library for (?:up to \w+ |a |an )?(?:basic )?lands?|put (?:a|that|those|target) lands? cards? .*onto the battlefield/i],
  ["draw", /\bdraws? (?:a|an|two|three|four|five|x|that many|\w+) cards?/i],
  ["removal", /(?:destroy|exile) target|deals? (?:\d+|x) damage to (?:any target|target|each)|target creature gets -\d|return target .* to its owner's hand/i],
  ["counterspell", /counter target/i],
  ["wipe", /(?:destroy|exile) all |each creature (?:gets|deals)|deals \d+ damage to each creature/i],
  ["tutor", /search your library for (?!(?:up to \w+ |a |an )?(?:basic )?lands?)/i],
  ["etb", /when(?:ever)? .*enters/i],
  ["recursion", /return .* from your graveyard|from your graveyard to the battlefield|from your graveyard to your hand/i],
];

export function tagsFor(c: Card): string[] {
  if (c.type_line.includes("Land") && !/search your library|draw/i.test(fullText(c))) return [];
  const text = fullText(c);
  return TAG_RULES.filter(([, re]) => re.test(text)).map(([t]) => t);
}

const isBasic = (c?: Card) => !!c && c.type_line.includes("Basic Land");
const allowsAny = (c?: Card) => !!c && /any number of cards named/i.test(fullText(c));

export function pipsOf(c: Card): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of manaCost(c).matchAll(/\{([^}]+)\}/g)) {
    for (const sym of m[1].split("/")) if ((COLORS as readonly string[]).includes(sym)) out[sym] = (out[sym] ?? 0) + 1;
  }
  return out;
}

export function analyze(entries: Entry[], cards: Map<string, Card>, onArena: Set<string>, fmt: FormatDef, loaded: boolean): Report {
  const rows: Row[] = entries.map((entry) => {
    const card = cards.get(key(entry.name));
    return { entry, card, tags: card ? tagsFor(card) : [] };
  });
  const issues: Issue[] = [];
  const inDeck = rows.filter((r) => r.entry.board !== "side");
  const total = inDeck.reduce((n, r) => n + r.entry.qty, 0);
  const side = rows.filter((r) => r.entry.board === "side").reduce((n, r) => n + r.entry.qty, 0);
  const commanderRows = rows.filter((r) => r.entry.board === "commander");

  // Size
  if (fmt.exactSize && total !== fmt.size) issues.push({ level: "error", msg: `Deck has ${total} cards; ${fmt.label} needs exactly ${fmt.size}${fmt.commander ? " (commander included)" : ""}.` });
  if (!fmt.exactSize && total < fmt.size) issues.push({ level: "error", msg: `Main deck has ${total} cards; minimum is ${fmt.size}.` });
  if (side > fmt.sideboard) issues.push({ level: "error", msg: `Sideboard has ${side} cards; max is ${fmt.sideboard}.` });

  if (!loaded) return { rows, issues, total, lands: 0, avgCmc: 0, curve: [], types: {}, noncreatureShare: 0, pips: {}, sources: {}, tags: {}, gameChangers: [] };

  const missing = rows.filter((r) => !r.card).map((r) => r.entry.name);
  if (missing.length) issues.push({ level: "error", msg: "Not found on Scryfall (check spelling; Alchemy cards use an “A-” prefix):", cards: missing });

  // Copies
  const over = inDeck.filter((r) => r.card && !isBasic(r.card) && !allowsAny(r.card) && r.entry.qty > fmt.copies).map((r) => `${r.entry.qty}× ${r.entry.name}`);
  if (over.length) issues.push({ level: "error", msg: `More than ${fmt.copies} cop${fmt.copies === 1 ? "y" : "ies"}:`, cards: over });

  // Legality + Arena availability
  const illegal = rows.filter((r) => r.card && !["legal", "restricted"].includes(r.card.legalities[fmt.legality] ?? "not_legal"));
  const notOnArena = fmt.arenaOnly ? illegal.filter((r) => !onArena.has(key(r.card!.name))) : [];
  const otherIllegal = illegal.filter((r) => !notOnArena.includes(r));
  if (notOnArena.length) issues.push({ level: "error", msg: "Not on MTG Arena (can't be played there):", cards: notOnArena.map((r) => r.entry.name) });
  if (otherIllegal.length) issues.push({ level: "error", msg: `Not legal in ${fmt.label}:`, cards: otherIllegal.map((r) => `${r.entry.name} (${r.card!.legalities[fmt.legality]?.replace("_", " ")})`) });
  if (fmt.arenaOnly) {
    const stray = rows.filter((r) => r.card && !onArena.has(key(r.card.name)) && !notOnArena.includes(r)).map((r) => r.entry.name);
    if (stray.length) issues.push({ level: "error", msg: "Not on MTG Arena:", cards: stray });
  }

  // Commander
  let identity: Set<string> | undefined;
  if (fmt.commander) {
    if (commanderRows.length === 0) issues.push({ level: "warn", msg: "No commander selected. Pick one above to enable color-identity checks." });
    else {
      identity = new Set(commanderRows.flatMap((r) => r.card?.color_identity ?? []));
      const bad = rows.filter((r) => r.entry.board === "main" && r.card && r.card.color_identity.some((c) => !identity!.has(c))).map((r) => `${r.entry.name} (${r.card!.color_identity.join("")})`);
      if (bad.length) issues.push({ level: "error", msg: `Outside the commander's color identity (${[...identity].join("") || "colorless"}):`, cards: bad });
    }
  }

  // Stats
  const nonland = inDeck.filter((r) => r.card && !r.card.type_line.includes("Land"));
  const landRows = inDeck.filter((r) => r.card?.type_line.includes("Land"));
  const lands = landRows.reduce((n, r) => n + r.entry.qty, 0);
  const nonlandCount = nonland.reduce((n, r) => n + r.entry.qty, 0);
  const curve = Array(8).fill(0) as number[];
  let cmcSum = 0;
  const types: Record<string, number> = {};
  const pips: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const tags: Record<string, number> = {};
  let creatures = 0;
  for (const r of inDeck) {
    if (!r.card) continue;
    const q = r.entry.qty;
    const tl = r.card.type_line;
    const t = TYPES.find((x) => tl.includes(x)) ?? "Other";
    types[tl.includes("Land") ? "Land" : tl.includes("Creature") ? "Creature" : t] = (types[tl.includes("Land") ? "Land" : tl.includes("Creature") ? "Creature" : t] ?? 0) + q;
    if (tl.includes("Land")) {
      for (const c of r.card.produced_mana ?? []) if ((COLORS as readonly string[]).includes(c)) sources[c] = (sources[c] ?? 0) + q;
      continue;
    }
    curve[Math.min(7, Math.floor(r.card.cmc))] += q;
    cmcSum += r.card.cmc * q;
    if (tl.includes("Creature")) creatures += q;
    for (const [c, n] of Object.entries(pipsOf(r.card))) pips[c] = (pips[c] ?? 0) + n * q;
    for (const t of r.tags) tags[t] = (tags[t] ?? 0) + q;
  }
  const gameChangers = inDeck.filter((r) => r.card?.game_changer).map((r) => r.entry.name);
  if (fmt.gameChangers) {
    const n = gameChangers.length;
    issues.push({
      level: n > 3 ? "warn" : "info",
      msg: `${n} Game Changer${n === 1 ? "" : "s"}${n === 0 ? " (Bracket 1–2 territory)" : n <= 3 ? " (Bracket 3 allows up to 3)" : " (over 3 puts the deck in Bracket 4)"}:`,
      cards: gameChangers,
    });
  }

  // Mana sanity
  if (nonlandCount) {
    const avg = cmcSum / nonlandCount;
    const ratio = lands / Math.max(total, 1);
    const target = fmt.commander ? 0.37 : 0.4;
    if (ratio < target - 0.06 && avg > 2) issues.push({ level: "warn", msg: `${lands} lands (${Math.round(ratio * 100)}%) with an average cost of ${avg.toFixed(2)} looks light.` });
    if (ratio > target + 0.08) issues.push({ level: "info", msg: `${lands} lands (${Math.round(ratio * 100)}%) is on the high side; check for flood.` });
    for (const c of COLORS) {
      if ((pips[c] ?? 0) >= 8 && (sources[c] ?? 0) < 8) issues.push({ level: "warn", msg: `${pips[c]} ${c} pips in spells but only ${sources[c] ?? 0} lands make ${c}.` });
    }
  }
  if (!issues.some((i) => i.level === "error")) issues.unshift({ level: "ok", msg: "No rule or legality problems found." });

  return {
    rows, issues, total, lands,
    avgCmc: nonlandCount ? cmcSum / nonlandCount : 0,
    curve, types,
    noncreatureShare: nonlandCount ? (nonlandCount - creatures) / nonlandCount : 0,
    pips, sources, tags, gameChangers,
  };
}

/** A paste-into-Claude prompt carrying verified Oracle text, so the model doesn't have to guess what cards do. */
export function buildPrompt(report: Report, fmt: FormatDef): string {
  const cmd = report.rows.filter((r) => r.entry.board === "commander");
  const fmtLine = (r: Row) => {
    const c = r.card;
    if (!c) return `${r.entry.qty} ${r.entry.name} — NOT FOUND`;
    return `${r.entry.qty} ${c.name} ${manaCost(c)} | ${c.type_line} | ${fullText(c).replace(/\n/g, " / ")}`;
  };
  const by = (pred: (r: Row) => boolean) => report.rows.filter(pred).map(fmtLine).join("\n");
  return [
    `Help me improve this ${fmt.label} deck.`,
    `Rules for your answer:`,
    `- The Oracle text below comes from Scryfall. Treat it as the only source of truth for what a card does; do not describe cards from memory.`,
    `- Only suggest cards you can confirm are legal in ${fmt.label}${fmt.arenaOnly ? " and available on MTG Arena" : ""}. If you can't confirm, say so instead of guessing.`,
    `- Before cutting a card, say what it does for this commander/strategy.`,
    ``,
    cmd.length ? `COMMANDER\n${by((r) => r.entry.board === "commander")}\n` : "",
    `DECK (${report.total} cards, ${report.lands} lands, avg mana value ${report.avgCmc.toFixed(2)}, ${Math.round(report.noncreatureShare * 100)}% of spells are noncreature)\n${by((r) => r.entry.board === "main")}`,
    report.rows.some((r) => r.entry.board === "side") ? `\nSIDEBOARD\n${by((r) => r.entry.board === "side")}` : "",
    ``,
    `KNOWN PROBLEMS\n${report.issues.filter((i) => i.level !== "ok").map((i) => `- ${i.msg}${i.cards ? " " + i.cards.join(", ") : ""}`).join("\n") || "- none detected"}`,
    ``,
    `What isn't working in my deck, which cards would you cut and add (with reasons), and why?`,
  ].filter((s) => s !== "").join("\n");
}
