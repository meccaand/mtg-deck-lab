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
- **AI suggestions (optional):** sends the deck, with the verified Oracle text for every card, to Claude and gets back one-for-one swaps with reasons. Every suggested card is then re-checked against Scryfall (exists, legal in the format, on Arena, inside the commander's colors, not already in the deck), and only verified swaps get an Apply button.
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

Everything except the AI tab runs in the browser and talks to the public Scryfall API (which allows browser requests). No database.

### Enable AI suggestions (optional)

1. Get an Anthropic API key from https://console.anthropic.com/.
2. `cp .env.example .env` and put your key in `ANTHROPIC_API_KEY=`.
3. Restart `npm run dev`.

The key is read by the local dev server (a small middleware in `server/ai.ts`) and is never sent to the browser. `.env` is gitignored. The AI tab needs `npm run dev` or `npm run preview`; it won't work on a static host because there is no backend there. Optional overrides: `ANTHROPIC_MODEL` (default `claude-opus-5-5`) and `ANTHROPIC_EFFORT` (`low` to `max`, default `high`). Each request uses API credits.

## Notes and limits

- AI suggestions are only as good as the model. The verification step catches invented cards, illegal cards, off-color cards and non-Arena cards, but not bad advice, so read each reason.
- Role tags are keyword matches on Oracle text. They highlight gaps; they aren't ground truth.
- If the commander isn't marked with a `Commander` header, pick it from the dropdown (legendary creatures and planeswalkers in the list).
- Card names must match Scryfall exactly. Alchemy rebalanced cards use an `A-` prefix.
- Arena Brawl legality uses Scryfall's `brawl` key and Standard Brawl uses `standardbrawl`. If Scryfall renames them, update `src/formats.ts`.

Card data and images are © Wizards of the Coast and provided by Scryfall. This project is unofficial.
