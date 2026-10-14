export interface Face {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
}

export interface Card {
  id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  color_identity: string[];
  produced_mana?: string[];
  legalities: Record<string, string>;
  game_changer?: boolean;
  card_faces?: Face[];
  scryfall_uri: string;
  image_uris?: { small?: string; normal?: string };
}

const API = "https://api.scryfall.com";
const HEADERS = { "Content-Type": "application/json", Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const key = (name: string) => name.toLowerCase();

/** Oracle text for the whole card, every face. */
export function fullText(c: Card): string {
  if (c.card_faces?.length && !c.oracle_text) {
    return c.card_faces.map((f) => `${f.name}${f.mana_cost ? ` ${f.mana_cost}` : ""} — ${f.type_line ?? ""}\n${f.oracle_text ?? ""}`).join("\n//\n");
  }
  return c.oracle_text ?? "";
}

export function manaCost(c: Card): string {
  return c.mana_cost || c.card_faces?.[0]?.mana_cost || "";
}

export function typeLine(c: Card): string {
  return c.type_line;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    const body = await res.json();
    if (!res.ok && res.status !== 404) throw new Error(body.details ?? `Scryfall error ${res.status}`);
    return body as T;
  }
  throw new Error("Scryfall rate limit hit; try again in a moment.");
}

/** Look up cards by exact name. Returns found cards keyed by lowercase name (front face and full name). */
export async function lookupCards(names: string[]): Promise<{ cards: Map<string, Card>; notFound: string[] }> {
  const cards = new Map<string, Card>();
  const notFound: string[] = [];
  const unique = [...new Set(names)];
  for (let i = 0; i < unique.length; i += 75) {
    const chunk = unique.slice(i, i + 75);
    const res = await request<{ data: Card[]; not_found: { name: string }[] }>(`${API}/cards/collection`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
    });
    for (const c of res.data) {
      cards.set(key(c.name), c);
      cards.set(key(c.name.split(" // ")[0]), c);
    }
    notFound.push(...res.not_found.map((n) => n.name));
    if (i + 75 < unique.length) await sleep(120);
  }
  return { cards, notFound };
}

/**
 * Which of these cards exist on MTG Arena? A card's `games` field is per printing, so a card whose default
 * printing is paper-only can still be on Arena. A `game:arena` oracle search is the reliable check.
 */
export async function arenaAvailability(cards: Card[]): Promise<Set<string>> {
  const onArena = new Set<string>();
  for (let i = 0; i < cards.length; i += 20) {
    const chunk = cards.slice(i, i + 20);
    const q = `game:arena (${chunk.map((c) => `!"${c.name.replace(/"/g, "")}"`).join(" or ")})`;
    let url: string | undefined = `${API}/cards/search?${new URLSearchParams({ q, unique: "cards" })}`;
    while (url) {
      const res: { data?: Card[]; has_more?: boolean; next_page?: string } = await request(url, { headers: { Accept: "application/json" } });
      for (const c of res.data ?? []) {
        onArena.add(key(c.name));
        onArena.add(key(c.name.split(" // ")[0]));
      }
      url = res.has_more ? res.next_page : undefined;
      await sleep(120);
    }
  }
  return onArena;
}

export async function searchCards(q: string): Promise<Card[]> {
  const res = await request<{ data?: Card[] }>(`${API}/cards/search?${new URLSearchParams({ q, unique: "cards", order: "edhrec" })}`, {
    headers: { Accept: "application/json" },
  });
  return (res.data ?? []).slice(0, 40);
}
