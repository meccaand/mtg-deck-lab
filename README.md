# MTG Deck Lab

A small, client-only web app for improving Magic: The Gathering decklists. Paste a list and it checks every card against [Scryfall](https://scryfall.com/docs/api), so nothing about a card is guessed from memory.

It was built after a couple of AI deck-review chats got card text wrong and suggested cards that aren't on Arena. The app exists to make those mistakes hard to repeat.

## What it does

- **Real card data.** Oracle text, mana cost, type, color identity and legality come straight from Scryfall.
- **Arena availability.** Checks with a `game:arena` search. A card's per-printing `games` field alone is unreliable, so this is a separate lookup.
- **Rules checks** for the chosen format: deck size, copy limit, legality, color identity vs. the commander, sideboard size, unknown card names.
- **Game Changer count** with Commander/Brawl bracket guidance (Bracket 3 allows up to 3).
- **Deck stats:** mana curve, land count, pips vs. land sources per color, card types, noncreature share, and rough role tags (ramp, draw, removal, counterspell, tutor…).
- **Find cards:** Scryfall search with the format, Arena and commander color-identity filters added for you, and a one-click add.
- **Export:** an Arena-importable list, plus a prompt for Claude (or any AI) that includes the verified Oracle text for every card and the problems found.

### Formats

Arena Brawl (100), Arena Standard Brawl (60), Commander, Standard, Pioneer, Modern, Legacy, Vintage, Pauper, Arena Historic and Arena Explorer. Formats live in `src/formats.ts`.

### Accepted input

Arena exports (with set codes and collector numbers), MTGO/plain `4 Lightning Bolt` lists, `Commander` / `Deck` / `Sideboard` headers, and lists flattened onto a single line.

## Run it

Requires Node.js 20+.

```bash
git clone https://github.com/meccaand/mtg-deck-lab.git
cd mtg-deck-lab
npm install
npm run dev
```

Open http://localhost:5173.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check and build to `dist/` (static files; host anywhere) |
| `npm test` | Parser tests |
| `npm run check` | Type-check only |

No API keys, backend or database. Everything runs in the browser and talks to the public Scryfall API (which allows browser requests).

## Notes and limits

- Role tags are keyword matches on Oracle text. They highlight gaps; they aren't ground truth.
- If the commander isn't marked with a `Commander` header, pick it from the dropdown (legendary creatures and planeswalkers in the list).
- Card names must match Scryfall exactly. Alchemy rebalanced cards use an `A-` prefix.
- Arena Brawl legality uses Scryfall's `brawl` key and Standard Brawl uses `standardbrawl`. If Scryfall renames them, update `src/formats.ts`.

Card data and images are © Wizards of the Coast and provided by Scryfall. This project is unofficial.
