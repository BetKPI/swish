import type { Metadata } from "next";
import Link from "next/link";
import { getTonightMLB, type TonightGame, type TonightStarter } from "@/lib/tonight-edge";

// Revalidate the page every hour - data churns through the day (lineups,
// weather updates) and this is the main SEO driver, so freshness matters.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const date = new Date().toISOString().slice(0, 10);
  return {
    title: `Tonight's MLB edge - ${date} | swish`,
    description: `Tonight's pitcher matchups, pitch arsenals, and ballpark + weather context for every MLB game. Updated hourly. Run any prop through the model in 20 seconds.`,
    openGraph: {
      title: `Tonight's MLB edge - ${date}`,
      description: `Pitcher matchups, pitch arsenals, ballpark + weather context for every MLB game tonight.`,
    },
  };
}

function fmtPct(n: number | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function pitchMix(s: TonightStarter): string {
  const arsenal = s.arsenal;
  if (!arsenal || arsenal.pitches.length === 0) return "—";
  return arsenal.pitches
    .slice(0, 3)
    .map((p) => `${p.pitchType} ${Math.round(p.usagePct)}%`)
    .join(" / ");
}

function bestKPitch(s: TonightStarter): string {
  const arsenal = s.arsenal;
  if (!arsenal || arsenal.pitches.length === 0) return "";
  const sorted = [...arsenal.pitches].sort((a, b) => b.whiffPct - a.whiffPct);
  const best = sorted[0];
  if (!best || best.whiffPct < 25) return "";
  return `${best.pitchType} (${best.whiffPct.toFixed(1)}% whiff)`;
}

function StarterCard({ s, label }: { s: TonightStarter | undefined; label: string }) {
  if (!s) {
    return (
      <div className="bg-surface/50 border border-border/40 rounded-lg p-3">
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted">{label}</p>
        <p className="text-sm text-muted mt-1">Starter TBD</p>
      </div>
    );
  }
  const kp = bestKPitch(s);
  return (
    <div className="bg-surface/50 border border-border/40 rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted">{label}</p>
        {s.pitchHand && (
          <span className="text-[10px] uppercase tracking-widest font-bold text-accent">{s.pitchHand}HP</span>
        )}
      </div>
      <p className="font-bold text-sm leading-tight">{s.name}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs">
        {s.era != null && (
          <span><span className="text-muted">ERA</span> <span className="font-bold tabular-nums">{s.era.toFixed(2)}</span></span>
        )}
        {s.kPer9 != null && (
          <span><span className="text-muted">K/9</span> <span className="font-bold tabular-nums">{s.kPer9.toFixed(1)}</span></span>
        )}
      </div>
      <p className="text-xs text-muted mt-2">
        <span className="text-muted/70 uppercase tracking-wider text-[10px] mr-1.5">Mix</span>
        <span className="font-mono">{pitchMix(s)}</span>
      </p>
      {kp && (
        <p className="text-xs text-emerald-400 mt-1">
          <span className="text-muted/70 uppercase tracking-wider text-[10px] mr-1.5">Top K-pitch</span>
          {kp}
        </p>
      )}
      {s.splits && (s.splits.vsL || s.splits.vsR) && (
        <p className="text-xs text-muted mt-1">
          <span className="text-muted/70 uppercase tracking-wider text-[10px] mr-1.5">K%</span>
          <span className="font-mono">
            L {fmtPct(s.splits.vsL?.kPct)} · R {fmtPct(s.splits.vsR?.kPct)}
          </span>
        </p>
      )}
    </div>
  );
}

function GameCard({ game }: { game: TonightGame }) {
  const w = game.weather;
  const hr = game.parkHrFactor;
  const dateLocal = new Date(game.gameTimeIso).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return (
    <article className="bg-surface rounded-xl border border-border/50 p-4 sm:p-5 space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="font-black text-base sm:text-lg uppercase tracking-tight">
          {game.awayTeam.name} <span className="text-muted/40 font-normal">@</span> {game.homeTeam.name}
        </h3>
        <span className="text-xs text-muted whitespace-nowrap">{dateLocal} ET</span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <StarterCard s={game.awayStarter} label={`${game.awayTeam.name} starter`} />
        <StarterCard s={game.homeStarter} label={`${game.homeTeam.name} starter`} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs pt-1">
        {w && !w.effectivelyIndoor && (
          <span className="bg-surface-light px-2 py-0.5 rounded">
            <span className="text-muted/70 uppercase tracking-wider text-[10px] mr-1.5">Weather</span>
            {w.tempF}°F, wind {w.windMph}mph {w.windDir}
            {w.precipProb >= 50 ? `, ${w.precipProb}% rain` : ""}
          </span>
        )}
        {w && w.effectivelyIndoor && (
          <span className="bg-surface-light px-2 py-0.5 rounded text-muted">
            <span className="uppercase tracking-wider text-[10px] mr-1.5">Park</span>
            {w.roof === "closed" ? "Indoor (no wind)" : "Roof closed (rain)"}
          </span>
        )}
        {hr != null && Math.abs(hr - 100) >= 5 && (
          <span className="bg-surface-light px-2 py-0.5 rounded">
            <span className="text-muted/70 uppercase tracking-wider text-[10px] mr-1.5">HR park</span>
            <span className={hr > 100 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
              {hr > 100 ? "+" : ""}{hr - 100}%
            </span>
          </span>
        )}
      </div>

      <div className="pt-2 border-t border-border/30">
        <Link
          href="/"
          className="text-xs font-bold uppercase tracking-wider text-accent hover:text-emerald-400"
        >
          Run a prop on this game →
        </Link>
      </div>
    </article>
  );
}

export default async function TonightPage() {
  const games = await getTonightMLB().catch(() => []);
  const date = new Date().toISOString().slice(0, 10);
  const friendly = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
      <header className="mb-8 sm:mb-10 text-center">
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-accent mb-2">Tonight's MLB edge</p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
          {friendly}
        </h1>
        <p className="text-muted text-sm mt-3 max-w-md mx-auto leading-relaxed">
          Probable starters, pitch arsenals, ballpark factors, weather. Updated hourly. Drop your slip into the tool to run any prop through the full model.
        </p>
      </header>

      {games.length === 0 ? (
        <div className="bg-surface/50 rounded-xl p-8 text-center">
          <p className="text-muted">No MLB games scheduled tonight.</p>
          <Link href="/" className="text-accent text-sm font-bold mt-3 inline-block">
            Try a different bet →
          </Link>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {games.map((g) => (
            <GameCard key={g.gamePk} game={g} />
          ))}
        </div>
      )}

      <footer className="mt-10 sm:mt-14 text-center">
        <Link
          href="/"
          className="inline-block py-3 px-6 bg-accent hover:bg-emerald-400 text-black font-bold rounded-xl text-sm"
        >
          Drop your bet slip → get the probability
        </Link>
        <p className="text-muted text-xs mt-4">
          Free. No signup. Built on MLB Stats API, Baseball Savant, and Open-Meteo.
        </p>
      </footer>

      {/* Schema.org SportsEvent markup for search engines */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(games.slice(0, 10).map((g) => ({
            "@context": "https://schema.org",
            "@type": "SportsEvent",
            name: `${g.awayTeam.name} at ${g.homeTeam.name}`,
            startDate: g.gameTimeIso,
            sport: "Baseball",
            homeTeam: { "@type": "SportsTeam", name: g.homeTeam.name },
            awayTeam: { "@type": "SportsTeam", name: g.awayTeam.name },
          }))),
        }}
      />

      {/* Structured WebPage with date for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: `Tonight's MLB edge - ${date}`,
            datePublished: date,
            description: "Probable starters, pitch arsenals, ballpark factors, and weather for every MLB game tonight.",
          }),
        }}
      />
    </div>
  );
}
