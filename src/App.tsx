import { useMemo, useState } from "react";
import { analyze, buildPrompt, COLORS, type Issue, type Report } from "./analyze";
import { FORMATS, formatById } from "./formats";
import { mergeDuplicates, parseDeck, toArenaText, type Entry } from "./parse";
import { arenaAvailability, fullText, key, lookupCards, manaCost, searchCards, type Card } from "./scryfall";

type Tab = "overview" | "cards" | "find" | "export";
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
                {(["overview", "cards", "find", "export"] as Tab[]).map((t) => (
                  <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                    {{ overview: "Overview", cards: "Cards", find: "Find cards", export: "Export" }[t]}
                  </button>
                ))}
              </nav>
              {!loaded ? <p className="muted">{busy || "…"}</p> : tab === "overview" ? <Overview report={report} /> : tab === "cards" ? <Cards report={report} onQty={changeQty} onArena={onArena} /> : tab === "find" ? (
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
