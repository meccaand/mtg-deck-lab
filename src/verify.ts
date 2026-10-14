import type { FormatDef } from "./formats";
import type { Entry } from "./parse";
import { arenaAvailability, key, lookupCards, type Card } from "./scryfall";

export interface Swap {
  cut: string;
  add: string;
  reason: string;
}

export interface Checked {
  swap: Swap;
  cutEntry?: Entry;
  addCard?: Card;
  /** Empty means the swap passed every check and can be applied. */
  problems: string[];
}

/**
 * Re-check AI suggestions against Scryfall. Models misremember cards, so nothing is
 * offered for one-click apply unless the real card is legal, on Arena (if required),
 * inside the commander's colors, and not already in the deck.
 */
export async function checkSwaps(swaps: Swap[], entries: Entry[], cards: Map<string, Card>, fmt: FormatDef): Promise<Checked[]> {
  const { cards: found } = await lookupCards(swaps.map((s) => s.add));
  const addCards = [...new Set(found.values())];
  const onArena = fmt.arenaOnly ? await arenaAvailability(addCards) : new Set<string>();
  const commander = entries.find((e) => e.board === "commander");
  const identity = commander ? new Set(cards.get(key(commander.name))?.color_identity ?? []) : undefined;
  const taken = new Set<string>();

  return swaps.map((swap) => {
    const problems: string[] = [];
    const cutEntry = entries.find((e) => e.board === "main" && key(e.name) === key(swap.cut));
    if (!cutEntry) problems.push(`“${swap.cut}” isn't in your main deck.`);
    const addCard = found.get(key(swap.add));
    if (!addCard) {
      problems.push(`“${swap.add}” doesn't exist on Scryfall (the AI misnamed or invented it).`);
    } else {
      const basic = addCard.type_line.includes("Basic Land");
      if (!basic && (entries.some((e) => key(e.name) === key(addCard.name)) || taken.has(key(addCard.name)))) problems.push("Already in the deck (or suggested twice).");
      taken.add(key(addCard.name));
      if (!["legal", "restricted"].includes(addCard.legalities[fmt.legality] ?? "not_legal")) {
        problems.push(fmt.arenaOnly && !onArena.has(key(addCard.name)) ? "Not on MTG Arena." : `Not legal in ${fmt.label}.`);
      } else if (fmt.arenaOnly && !onArena.has(key(addCard.name))) problems.push("Not on MTG Arena.");
      if (identity && addCard.color_identity.some((c) => !identity.has(c))) problems.push(`Outside the commander's colors (${addCard.color_identity.join("")}).`);
    }
    return { swap, cutEntry, addCard, problems };
  });
}
