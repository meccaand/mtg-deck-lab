import { useEffect, useMemo, useState } from "react";
import { analyze, buildPrompt, COLORS, type Issue, type Report } from "./analyze";
import { FORMATS, formatById } from "./formats";
import { mergeDuplicates, parseDeck, toArenaText, type Entry } from "./parse";
import { aiStatus, requestSuggestions, type Suggestion } from "./ai";
import { checkSwaps, type Checked } from "./verify";
import { arenaAvailability, fullText, key, lookupCards, manaCost, searchCards, type Card } from "./scryfall";

type Tab = "overview" | "cards" | "suggest" | "find" | "export";
const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const SAMPLE = `Commander
1 Narset, Enlightened Master

Deck
1 Lightning Bolt
1 Counterspell
1 Swords to Plowshares
1 Jeskai Revelation
1 Akroma's Will
1 Arcane Signet
1 Command Tower
1 Sacred Foundry
7 Island
6 Mountain
5 Plains`;

export default function App() {
  const [text, setText] = useState("");
  const [formatId, setFormatId] = useState("arena-brawl");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  const [onArena, setOnArena] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const fmt = formatById(formatId);

  const report = useMemo(() => analyze(entries, cards, onArena, fmt, loaded), [entries, cards, onArena, fmt, loaded]);
  const commander = entries.find((e) => e.board === "commander")?.name ?? "";
  const commanderCard = cards.get(key(commander));
  const candidates = report.rows.filter((r) => r.card && /Legendary/.test(r.card.type_line) && /Creature|Planeswalker/.test(r.card.type_line)).map((r) => r.entry.name);

  async function run() {
    setError("");
    const parsed = parseDeck(text);
    if (!parsed.length) return setError("Couldn't find any cards. Paste a list like “4 Lightning Bolt”.");
    setEntries(parsed);
    setLoaded(false);
    try {
      setBusy("Looking up cards on Scryfall…");
      const { cards: found } = await lookupCards(parsed.map((e) => e.name));
      setCards(found);
      setBusy("Checking Arena availability…");
      setOnArena(await arenaAvailability([...new Set(found.values())]));
      setLoaded(true);
      setTab("overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  function setCommander(name: string) {
    setEntries((es) =>
      mergeDuplicates(
        es.map((e): Entry => {
          if (e.board === "commander") return { ...e, board: "main" };
          return name && e.name === name && e.board === "main" ? { ...e, qty: 1, board: "commander" } : e;
        }),
      ),
    );
  }
  const changeQty = (e: Entry, d: number) =>
    setEntries((es) => es.map((x) => (x === e ? { ...x, qty: x.qty + d } : x)).filter((x) => x.qty > 0));
  const addCard = (c: Card) => {
    setCards((m) => new Map(m).set(key(c.name), c).set(key(c.name.split(" // ")[0]), c));
    setOnArena((s) => new Set(s).add(key(c.name)));
    setEntries((es) => {
      const hit = es.find((e) => e.board === "main" && key(e.name) === key(c.name));
      return hit ? es.map((e) => (e === hit ? { ...e, qty: e.qty + 1 } : e)) : [...es, { qty: 1, name: c.name, board: "main" }];
    });
  };

  return (
    <div className="app">
      <header>
        <h1>MTG Deck Lab</h1>
        <p>Paste a decklist. Every card is checked against Scryfall's real Oracle text, legality and Arena availability, so nothing is guessed.</p>
      </header>
      <div className="layout">
        <aside>
          <label>
            Format
            <select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          <label>
            Decklist
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} spellCheck={false} placeholder={"Commander\n1 Yarok, the Desecrated\n\nDeck\n1 Abrupt Decay\n9 Forest\n…"} />
          </label>
          <div className="row">
            <button className="primary" onClick={run} disabled={!!busy || !text.trim()}>{busy ? "Working…" : "Analyze"}</button>
            <button onClick={() => setText(SAMPLE)} disabled={!!busy}>Try a sample</button>
          </div>
          {busy && <p className="muted">{busy}</p>}
          {error && <p className="err">{error}</p>}
          <p className="muted small">Accepts Arena exports (with set codes), MTGO/plain “4 Name” lists, Commander/Deck/Sideboard headers, and lists flattened onto one line.</p>
        </aside>
        <main>
          {!entries.length ? (
            <div className="empty">Your analysis will show up here.</div>
          ) : (
            <>
              {fmt.commander && loaded && (
                <div className="commander">
                  <label>
                    Commander
                    <select value={commander} onChange={(e) => setCommander(e.target.value)}>
                      <option value="">— pick one —</option>
                      {[...new Set([commander, ...candidates].filter(Boolean))].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  {commanderCard && <p className="oracle">{fullText(commanderCard)}</p>}
                </div>
              )}
              <nav>
                {(["overview", "cards", "suggest", "find", "export"] as Tab[]).map((t) => (
                  <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                    {{ overview: "Overview", cards: "Cards", suggest: "AI suggestions", find: "Find cards", export: "Export" }[t]}
                  </button>
                ))}
              </nav>
              {!loaded ? <p className="muted">{busy || "…"}</p> : tab === "overview" ? <Overview report={report} /> : tab === "cards" ? <Cards report={report} onQty={changeQty} onArena={onArena} /> : tab === "suggest" ? (
                <Suggest report={report} entries={entries} cards={cards} fmtId={formatId} onQty={changeQty} onAdd={addCard} />
              ) : tab === "find" ? (
                <Find fmtId={formatId} commander={commanderCard} entries={entries} onAdd={addCard} />
              ) : (
                <Export report={report} entries={entries} fmtId={formatId} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <ul className="issues">
      {issues.map((i, n) => (
        <li key={n} className={i.level}>
          <span>{i.msg}</span>
          {i.cards && <span className="chips">{i.cards.map((c) => <em key={c}>{c}</em>)}</span>}
        </li>
      ))}
    </ul>
  );
}

function Overview({ report: r }: { report: Report }) {
  const maxCurve = Math.max(1, ...r.curve);
  const spells = r.total - r.lands;
  return (
    <>
      <IssueList issues={r.issues} />
      <div className="tiles">
        <Tile label="Cards" value={r.total} />
        <Tile label="Lands" value={r.lands} />
        <Tile label="Avg. mana value" value={r.avgCmc.toFixed(2)} />
        <Tile label="Noncreature spells" value={`${Math.round(r.noncreatureShare * 100)}%`} />
      </div>
      <h3>Mana curve (nonland)</h3>
      <div className="curve">
        {r.curve.map((n, i) => (
          <div key={i}>
            <span>{n}</span>
            <div className="bar" style={{ height: `${(n / maxCurve) * 100}%` }} />
            <small>{i === 7 ? "7+" : i}</small>
          </div>
        ))}
      </div>
      <h3>Colors: spell pips vs. land sources</h3>
      <table className="plain">
        <tbody>
          {COLORS.filter((c) => r.pips[c] || r.sources[c]).map((c) => (
            <tr key={c}>
              <td>{COLOR_NAMES[c]}</td>
              <td>{r.pips[c] ?? 0} pips</td>
              <td>{r.sources[c] ?? 0} lands</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Card types</h3>
      <p className="chips">{Object.entries(r.types).sort((a, b) => b[1] - a[1]).map(([t, n]) => <em key={t}>{t} {n}</em>)}</p>
      <h3>Roles <small className="muted">(keyword guess from Oracle text; of {spells} spells)</small></h3>
      <p className="chips">{Object.entries(r.tags).sort((a, b) => b[1] - a[1]).map(([t, n]) => <em key={t}>{t} {n}</em>)}</p>
    </>
  );
}

const Tile = ({ label, value }: { label: string; value: string | number }) => (
  <div className="tile"><strong>{value}</strong><span>{label}</span></div>
);

function Cards({ report, onQty, onArena }: { report: Report; onQty: (e: Entry, d: number) => void; onArena: Set<string> }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const rows = report.rows
    .filter((r) => (!tag || r.tags.includes(tag)) && (!q || `${r.entry.name} ${r.card ? fullText(r.card) + r.card.type_line : ""}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.card?.cmc ?? 99) - (b.card?.cmc ?? 99) || a.entry.name.localeCompare(b.entry.name));
  return (
    <>
      <div className="row">
        <input placeholder="Filter by name, type or rules text…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All roles</option>
          {Object.keys(report.tags).map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <table className="cards">
        <tbody>
          {rows.map((r) => (
            <tr key={r.entry.board + r.entry.name}>
              <td className="qty">
                <button onClick={() => onQty(r.entry, -1)}>−</button>
                {r.entry.qty}
                <button onClick={() => onQty(r.entry, 1)}>+</button>
              </td>
              <td>
                <a href={r.card?.scryfall_uri} target="_blank" rel="noreferrer"><strong>{r.entry.name}</strong></a> <span className="muted">{r.card ? manaCost(r.card) : ""}</span>
                {r.entry.board !== "main" && <em className="badge">{r.entry.board}</em>}
                {r.card?.game_changer && <em className="badge warnb">game changer</em>}
                {r.card && !onArena.has(key(r.card.name)) && <em className="badge errb">not on Arena</em>}
                <div className="muted small">{r.card?.type_line} {r.tags.length > 0 && `· ${r.tags.join(", ")}`}</div>
                <div className="oracle">{r.card ? fullText(r.card) : "Not found on Scryfall."}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Find({ fmtId, commander, entries, onAdd }: { fmtId: string; commander?: Card; entries: Entry[]; onAdd: (c: Card) => void }) {
  const fmt = formatById(fmtId);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Card[]>([]);
  const [msg, setMsg] = useState("");
  const prefix = [fmt.arenaOnly && "game:arena", `f:${fmt.legality}`, fmt.commander && commander && `id<=${commander.color_identity.join("") || "c"}`].filter(Boolean).join(" ");
  async function go() {
    setMsg("Searching…");
    try {
      const r = await searchCards(`${prefix} ${q}`);
      setResults(r);
      setMsg(r.length ? "" : "No cards matched.");
    } catch (e) {
      setResults([]);
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }
  const inDeck = new Set(entries.map((e) => key(e.name)));
  return (
    <>
      <p className="muted small">Searches Scryfall with <code>{prefix}</code> added automatically. Try <code>o:"whenever you cast" t:creature</code> or <code>t:instant mv&lt;=2 o:draw</code>.</p>
      <div className="row">
        <input placeholder='Scryfall search, e.g. o:"enters" t:creature' value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
        <button className="primary" onClick={go}>Search</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      <table className="cards">
        <tbody>
          {results.map((c) => (
            <tr key={c.id}>
              <td className="qty"><button onClick={() => onAdd(c)} disabled={inDeck.has(key(c.name)) && fmt.copies === 1}>{inDeck.has(key(c.name)) ? "In deck" : "Add"}</button></td>
              <td>
                <a href={c.scryfall_uri} target="_blank" rel="noreferrer"><strong>{c.name}</strong></a> <span className="muted">{manaCost(c)}</span>
                {c.game_changer && <em className="badge warnb">game changer</em>}
                <div className="muted small">{c.type_line}</div>
                <div className="oracle">{fullText(c)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Export({ report, entries, fmtId }: { report: Report; entries: Entry[]; fmtId: string }) {
  const arena = toArenaText(entries);
  const prompt = buildPrompt(report, formatById(fmtId));
  return (
    <>
      <Copyable title="Arena import list" hint="Paste into Arena: Decks → Import." text={arena} />
      <Copyable title="Prompt for Claude (or any AI)" hint="Includes the verified Oracle text for every card plus the problems found above, so the AI doesn't have to guess what cards do." text={prompt} />
    </>
  );
}

function Copyable({ title, hint, text }: { title: string; hint: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <section>
      <h3>{title}</h3>
      <p className="muted small">{hint}</p>
      <textarea readOnly value={text} rows={10} />
      <button onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? "Copied" : "Copy"}</button>
    </section>
  );
}

function Suggest({ report, entries, cards, fmtId, onQty, onAdd }: { report: Report; entries: Entry[]; cards: Map<string, Card>; fmtId: string; onQty: (e: Entry, d: number) => void; onAdd: (c: Card) => void }) {
  const fmt = formatById(fmtId);
  const [status, setStatus] = useState<{ enabled: boolean; model: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [out, setOut] = useState<{ s: Suggestion; checked: Checked[]; model: string } | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  useEffect(() => { aiStatus().then(setStatus); }, []);

  async function go() {
    setError("");
    setOut(null);
    setApplied(new Set());
    try {
      setBusy("Claude is reading your deck. This can take a minute or two…");
      const r = await requestSuggestions(buildPrompt(report, fmt));
      if (r.refused) throw new Error(`The model declined this request${r.category ? ` (${r.category})` : ""}.`);
      setBusy("Verifying every suggestion against Scryfall…");
      const checked = await checkSwaps(r.result.swaps, entries, cards, fmt);
      setOut({ s: r.result, checked, model: r.model });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  function apply(i: number) {
    const c = out?.checked[i];
    if (!c?.cutEntry || !c.addCard || c.problems.length || applied.has(i)) return;
    onQty(c.cutEntry, -1);
    onAdd(c.addCard);
    setApplied((a) => new Set(a).add(i));
  }
  const ok = out?.checked.map((c, i) => (c.problems.length === 0 && !applied.has(i) ? i : -1)).filter((i) => i >= 0) ?? [];

  if (status === undefined) return <p className="muted">Checking AI setup…</p>;
  if (!status?.enabled) {
    return (
      <div>
        <p><strong>AI suggestions aren't set up yet.</strong></p>
        <p className="muted">Create a file named <code>.env</code> in the project folder containing <code>ANTHROPIC_API_KEY=your-key</code>, then restart <code>npm run dev</code>. The key stays on your machine: it is read by the local dev server and never sent to the browser. See <code>.env.example</code>.</p>
        {status === null && <p className="err">The AI endpoint isn't reachable. AI suggestions only work with <code>npm run dev</code> or <code>npm run preview</code>, not a static host.</p>}
      </div>
    );
  }
  return (
    <>
      <p className="muted small">Sends your deck, with Scryfall's real Oracle text for every card, to Claude ({status.model}). Every suggested card is then re-checked against Scryfall for legality, Arena availability, color identity and duplicates before you can apply it.</p>
      <div className="row">
        <button className="primary" onClick={go} disabled={!!busy || report.total === 0}>{busy ? "Working…" : out ? "Ask again" : "Get AI suggestions"}</button>
        {out && ok.length > 0 && <button onClick={() => ok.forEach(apply)}>Apply all {ok.length} verified</button>}
      </div>
      {busy && <p className="muted">{busy}</p>}
      {error && <p className="err">{error}</p>}
      {out && (
        <>
          <h3>Assessment</h3>
          <p className="oracle">{out.s.assessment}</p>
          <h3>What the deck needs to do</h3>
          <p className="oracle">{out.s.game_plan}</p>
          <h3>Suggested swaps</h3>
          <table className="cards">
            <tbody>
              {out.checked.map((c, i) => (
                <tr key={i}>
                  <td className="qty">
                    <button onClick={() => apply(i)} disabled={c.problems.length > 0 || applied.has(i)}>{applied.has(i) ? "Applied" : "Apply"}</button>
                  </td>
                  <td>
                    <div>
                      <span className="muted">Cut</span> <strong>{c.swap.cut}</strong> <span className="muted">→ Add</span> <strong>{c.addCard ? <a href={c.addCard.scryfall_uri} target="_blank" rel="noreferrer">{c.addCard.name}</a> : c.swap.add}</strong>
                      {c.problems.length === 0 ? <em className="badge okb">verified</em> : <em className="badge errb">can't apply</em>}
                    </div>
                    <div className="oracle">{c.swap.reason}</div>
                    {c.problems.map((p) => <div key={p} className="err small">{p}</div>)}
                    {c.addCard && <div className="muted small">{c.addCard.type_line} {manaCost(c.addCard)} — {fullText(c.addCard).replace(/\n/g, " / ")}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Generated by {out.model}. Verified means Scryfall confirms the card exists and passes the format, Arena, color and duplicate checks. It does not mean the swap is a good idea; read the reason.</p>
        </>
      )}
    </>
  );
}
