import type { Swap } from "./verify";

export interface Suggestion {
  assessment: string;
  game_plan: string;
  swaps: Swap[];
}

export type SuggestResponse = { refused: true; category: string | null } | { refused: false; result: Suggestion; model: string };

export async function aiStatus(): Promise<{ enabled: boolean; model: string } | null> {
  try {
    const res = await fetch("/api/ai-status");
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function requestSuggestions(deck: string): Promise<SuggestResponse> {
  const res = await fetch("/api/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deck }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as SuggestResponse;
}
