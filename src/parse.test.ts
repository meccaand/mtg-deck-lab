import { describe, expect, it } from "vitest";
import { parseDeck, toArenaText } from "./parse";

describe("parseDeck", () => {
  it("parses Arena export with sections, set codes and collector numbers", () => {
    const e = parseDeck("Commander\n1 Yarok, the Desecrated (MUL) 128\n\nDeck\n1 Abrupt Decay (OTP) 34\n9 Forest (KTK) 258\n");
    expect(e).toEqual([
      { qty: 1, name: "Yarok, the Desecrated", set: "mul", num: "128", board: "commander" },
      { qty: 1, name: "Abrupt Decay", set: "otp", num: "34", board: "main" },
      { qty: 9, name: "Forest", set: "ktk", num: "258", board: "main" },
    ]);
  });
  it("parses decklists flattened onto one line, with a header glued to the first card", () => {
    const e = parseDeck("Commander 1 Yarok, the Desecrated (MUL) 128\nDeck 1 Abrupt Decay (OTP) 34 1 Ancient Greenwarden (J25) 627 12 Island (KTK) 252");
    expect(e.map((x) => [x.qty, x.name, x.board])).toEqual([
      [1, "Yarok, the Desecrated", "commander"],
      [1, "Abrupt Decay", "main"],
      [1, "Ancient Greenwarden", "main"],
      [12, "Island", "main"],
    ]);
  });
  it("parses a bare one-line list of names", () => {
    const e = parseDeck("1 Abrade 1 Abraded Bluffs 7 Island 1 Narset, Parter of Veils");
    expect(e.map((x) => [x.qty, x.name])).toEqual([[1, "Abrade"], [1, "Abraded Bluffs"], [7, "Island"], [1, "Narset, Parter of Veils"]]);
  });
  it("handles sideboard, comments, 4x quantities and merges duplicates", () => {
    const e = parseDeck("// my deck\n4x Lightning Bolt\n2 Lightning Bolt\n\nSideboard\n3 Negate");
    expect(e).toEqual([
      { qty: 6, name: "Lightning Bolt", set: undefined, num: undefined, board: "main" },
      { qty: 3, name: "Negate", set: undefined, num: undefined, board: "side" },
    ]);
  });
  it("round-trips to Arena text", () => {
    expect(toArenaText(parseDeck("Commander\n1 A\nDeck\n2 B"))).toBe("Commander\n1 A\n\nDeck\n2 B");
  });
});
