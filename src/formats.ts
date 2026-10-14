export interface FormatDef {
  id: string;
  label: string;
  /** Scryfall legalities key */
  legality: string;
  /** Required main-deck size (commander included for commander formats). `min` formats allow more. */
  size: number;
  exactSize: boolean;
  /** Max copies of a non-basic card. */
  copies: number;
  commander: boolean;
  /** Every card must be available on MTG Arena. */
  arenaOnly: boolean;
  sideboard: number;
  /** Counts Game Changers (Commander-style bracket guidance). */
  gameChangers: boolean;
}

export const FORMATS: FormatDef[] = [
  { id: "arena-brawl", label: "Arena Brawl (100 cards, Brawl)", legality: "brawl", size: 100, exactSize: true, copies: 1, commander: true, arenaOnly: true, sideboard: 0, gameChangers: true },
  { id: "arena-standard-brawl", label: "Arena Standard Brawl (60 cards)", legality: "standardbrawl", size: 60, exactSize: true, copies: 1, commander: true, arenaOnly: true, sideboard: 0, gameChangers: false },
  { id: "commander", label: "Commander (paper / MTGO)", legality: "commander", size: 100, exactSize: true, copies: 1, commander: true, arenaOnly: false, sideboard: 0, gameChangers: true },
  { id: "standard", label: "Standard", legality: "standard", size: 60, exactSize: false, copies: 4, commander: false, arenaOnly: false, sideboard: 15, gameChangers: false },
  { id: "pioneer", label: "Pioneer", legality: "pioneer", size: 60, exactSize: false, copies: 4, commander: false, arenaOnly: false, sideboard: 15, gameChangers: false },
  { id: "modern", label: "Modern", legality: "modern", size: 60, exactSize: false, copies: 4, commander: false, arenaOnly: false, sideboard: 15, gameChangers: false },
  { id: "legacy", label: "Legacy", legality: "legacy", size: 60, exactSize: false, copies: 4, commander: false, arenaOnly: false, sideboard: 15, gameChangers: false },
  { id: "vintage", label: "Vintage", legality: "vintage", size: 60, exactSize: false, copies: 4, commander: false, arenaOnly: false, sideboard: 15, gameChangers: false },
  { id: "pauper", label: "Pauper", legality: "pauper", size: 60, exactSize: false, copies: 4, commander: false, arenaOnly: false, sideboard: 15, gameChangers: false },
  { id: "historic", label: "Arena Historic", legality: "historic", size: 60, exactSize: false, copies: 4, commander: false, arenaOnly: true, sideboard: 15, gameChangers: false },
  { id: "explorer", label: "Arena Explorer", legality: "explorer", size: 60, exactSize: false, copies: 4, commander: false, arenaOnly: true, sideboard: 15, gameChangers: false },
];

export const formatById = (id: string): FormatDef => FORMATS.find((f) => f.id === id) ?? FORMATS[0];
