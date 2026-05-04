"use client";

import { useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LabelList,
} from "recharts";
import type { BetExtraction, ChartConfig, GameStatusData, MLBInsights } from "@/types";
import AnalysisChat from "./AnalysisChat";
import FeedbackShare from "./FeedbackShare";
import GameStatusBanner from "./GameStatusBanner";
import MLBHero from "./MLBHero";
import { captureWithWatermark, copyImageToClipboard } from "@/lib/captureWithWatermark";

interface SwishScore {
  score: number;
  label: string;
  detail: string;
}

interface Props {
  extraction: BetExtraction;
  charts: ChartConfig[];
  summary: string;
  computedData?: Record<string, unknown>;
  gameStatus?: GameStatusData;
  visuals?: Record<string, unknown>;
  swishScore?: SwishScore;
  keyInsight?: string;
  suggestions?: string[];
  insights?: MLBInsights;
  onReset: () => void;
}

type ChartRow = {
  game: string;
  value: number;
  line?: number;
  overLine?: boolean;
};

const TIME_WINDOWS = [
  { label: "L5", value: 5 },
  { label: "L10", value: 10 },
  { label: "L20", value: 20 },
  { label: "All", value: null as number | null },
];

function hitRate(rows: ChartRow[]): number | null {
  if (rows.length === 0) return null;
  const overs = rows.filter((r) => r.overLine).length;
  return Math.round((overs / rows.length) * 100);
}

function formatStatLabel(market?: string, description?: string): string {
  const m = `${market || ""} ${description || ""}`.toLowerCase();
  if (m.includes("strikeout") || /\bks?\b/.test(m)) return "Strikeouts";
  if (m.includes("total base")) return "Total Bases";
  if (m.includes("home run") || /\bhr\b/.test(m)) return "Home Runs";
  if (m.includes("rbi")) return "RBI";
  if (m.includes("stolen base")) return "Stolen Bases";
  if (m.includes("run scored") || m.includes("runs scored")) return "Runs";
  if (m.includes("hit")) return "Hits";
  return market || "Stat";
}

function buildVerdict(rows: ChartRow[], stat: string, line?: number): string {
  if (rows.length === 0 || line == null) return "";
  const last10 = rows.slice(-10);
  const overs = last10.filter((r) => r.overLine).length;
  // Streak from end
  let streak = 0;
  for (let i = last10.length - 1; i >= 0; i--) {
    if (last10[i].overLine) streak++;
    else break;
  }
  const word = stat.toLowerCase().includes("strike")
    ? `cleared ${line}`
    : `hit ${line}+`;
  if (streak >= 3) {
    return `${word.charAt(0).toUpperCase() + word.slice(1)} in ${overs} of last ${last10.length} — ${streak} straight.`;
  }
  return `${word.charAt(0).toUpperCase() + word.slice(1)} in ${overs} of last ${last10.length}.`;
}

export default function MLBPlayerPropCard({
  extraction,
  charts,
  summary,
  computedData,
  gameStatus,
  visuals,
  swishScore,
  suggestions,
  insights,
  onReset,
}: Props) {
  const [windowVal, setWindowVal] = useState<number | null>(10);
  const [shareState, setShareState] = useState<"idle" | "capturing" | "copied" | "downloaded">("idle");

  const handleShare = useCallback(async () => {
    const el = document.getElementById("mlb-card");
    if (!el) return;
    setShareState("capturing");
    try {
      const blob = await captureWithWatermark(el, "swish-mlb.png");
      if (!blob) { setShareState("idle"); return; }
      const didCopy = await copyImageToClipboard(blob, "swish-mlb.png");
      setShareState(didCopy ? "copied" : "downloaded");
    } catch {
      setShareState("idle");
      return;
    }
    setTimeout(() => setShareState("idle"), 2000);
  }, []);

  const oppTeam = extraction.teams[1];
  const stat = formatStatLabel(extraction.market, extraction.description);
  const line = extraction.line;

  // Find the primary hit-rate chart
  const primaryChart = charts.find((c) => c.type === "hitrate");
  const allRows = (primaryChart?.data as ChartRow[] | undefined) || [];
  const filteredRows = windowVal != null ? allRows.slice(-windowVal) : allRows;

  const seasonRate = hitRate(allRows);
  const l5 = hitRate(allRows.slice(-5));
  const l10 = hitRate(allRows.slice(-10));
  const l20 = hitRate(allRows.slice(-20));

  const verdict = insights?.verdict || buildVerdict(allRows, stat, line);
  const projection = insights?.projection;
  const insightBullets = insights?.bullets || [];
  const flags = insights?.flags || [];

  // Secondary tables (BvP / vs opponent)
  const tables = charts.filter((c) => c.type === "table");

  const isFinal = gameStatus?.state === "post";
  const grade = gameStatus?.grade?.result;
  const isHit = grade === "hit";
  const isMiss = grade === "miss";

  return (
    <div className="space-y-4" id="mlb-card">
      {/* HIT/MISS banner when graded */}
      {isFinal && (isHit || isMiss) && (
        <div className={`rounded-xl p-4 text-center border-2 ${
          isHit ? "bg-emerald-500/15 border-emerald-500/40" : "bg-red-500/15 border-red-500/40"
        }`}>
          <p className={`text-3xl sm:text-4xl font-black ${isHit ? "text-emerald-400" : "text-red-400"}`}>
            {isHit ? "HIT" : "MISS"}
          </p>
          <p className={`text-sm mt-1 ${isHit ? "text-emerald-400/80" : "text-red-400/80"}`}>
            {gameStatus?.grade?.detail || (isHit ? "Cashed!" : "Didn't hit.")}
          </p>
        </div>
      )}

      {gameStatus && (gameStatus.state === "in" || gameStatus.state === "post") && (
        <GameStatusBanner
          status={gameStatus}
          sport={extraction.sport}
          teams={extraction.teams}
          betType={extraction.betType}
          players={extraction.players}
          market={extraction.market}
          line={extraction.line}
        />
      )}

      <MLBHero extraction={extraction} visuals={visuals} swishScore={swishScore} variant="full" />

      {/* VERDICT + PROJECTION ROW */}
      <div className="space-y-2 px-1">
        {verdict && (
          <p className="text-base sm:text-lg font-bold leading-snug">
            {verdict}
          </p>
        )}
        {projection && (
          <ProjectionPill projection={projection} line={line} />
        )}
      </div>

      {/* PRIMARY CHART */}
      {primaryChart && allRows.length > 0 && line != null && (
        <div className="bg-surface rounded-xl border border-border/50 p-4 sm:p-5 space-y-3">
          {/* Time toggles */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {TIME_WINDOWS.map((w) => {
              const enabled = w.value == null || allRows.length >= 1;
              return (
                <button
                  key={w.label}
                  onClick={() => setWindowVal(w.value)}
                  disabled={!enabled}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-colors cursor-pointer tabular-nums ${
                    windowVal === w.value
                      ? "bg-accent text-black"
                      : "bg-surface-light text-muted hover:text-foreground"
                  }`}
                >
                  {w.label}
                </button>
              );
            })}
          </div>

          {/* Hit rate strip */}
          <div className="flex items-baseline justify-around gap-2 py-1">
            {[
              { lbl: "L5", val: l5 },
              { lbl: "L10", val: l10 },
              { lbl: "L20", val: l20 },
              { lbl: "Season", val: seasonRate },
            ].map((r) => (
              <div key={r.lbl} className="text-center min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-muted font-bold">{r.lbl}</div>
                <div className={`text-base sm:text-lg font-black tabular-nums ${
                  r.val == null
                    ? "text-muted"
                    : r.val >= 60
                      ? "text-emerald-400"
                      : r.val <= 40
                        ? "text-red-400"
                        : "text-foreground"
                }`}>
                  {r.val != null ? `${r.val}%` : "—"}
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={filteredRows} margin={{ top: 16, right: 8, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
              <XAxis
                dataKey="game"
                tick={{ fill: "#888", fontSize: 9 }}
                stroke="#222"
                interval={0}
                angle={-35}
                textAnchor="end"
                height={48}
              />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} stroke="#222" allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#0a0a0a",
                  border: "1px solid #2a2a2a",
                  borderRadius: 8,
                  fontSize: 12,
                  padding: "6px 10px",
                }}
                cursor={{ fill: "#ffffff08" }}
                formatter={(val, _name, props) => {
                  const over = (props as unknown as { payload: ChartRow }).payload?.overLine;
                  return [String(val), over ? "OVER" : "UNDER"];
                }}
              />
              <ReferenceLine
                y={line}
                stroke="#f59e0b"
                strokeDasharray="6 4"
                strokeWidth={2}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={32}>
                <LabelList dataKey="value" position="top" fill="#e5e5e5" fontSize={11} fontWeight={800} />
                {filteredRows.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.overLine ? "#10b981" : "#ef4444"}
                    fillOpacity={0.92}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* INSIGHT BULLETS — split by tone into Edge / Risk / Context */}
      {insightBullets.length > 0 && (() => {
        const pos = insightBullets.filter((b) => b.tone === "pos");
        const neg = insightBullets.filter((b) => b.tone === "neg");
        const neu = insightBullets.filter((b) => b.tone === "neutral");
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pos.length > 0 && (
              <InsightGroup
                title="The edge"
                accent="emerald"
                bullets={pos}
              />
            )}
            {neg.length > 0 && (
              <InsightGroup
                title="The risk"
                accent="red"
                bullets={neg}
              />
            )}
            {neu.length > 0 && (
              <div className={`${pos.length === 0 && neg.length === 0 ? "sm:col-span-2" : pos.length > 0 || neg.length > 0 ? "sm:col-span-2" : ""}`}>
                <InsightGroup
                  title="Context"
                  accent="muted"
                  bullets={neu}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* RISK FLAGS */}
      {flags.length > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-widest font-bold text-yellow-400 mb-1.5">
            Heads up
          </div>
          <ul className="space-y-1 text-xs text-yellow-200/90">
            {flags.map((f, i) => (
              <li key={i} className="leading-relaxed">• {f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* MATCHUP DETAILS — collapsed by default */}
      {tables.length > 0 && (
        <Collapsible label="Matchup details" count={tables.length}>
          <div className="space-y-2 pt-2">
            {tables.map((t, i) => (
              <CompactTable key={i} chart={t} />
            ))}
          </div>
        </Collapsible>
      )}

      {/* FULL ANALYSIS — collapsed by default */}
      {summary && (
        <Collapsible label="The breakdown">
          <p className="text-sm text-foreground/85 leading-[1.7] pt-2">{summary}</p>
        </Collapsible>
      )}

      {/* ASK A FOLLOW-UP — collapsed by default */}
      <Collapsible label="Ask a follow-up">
        <div className="pt-2">
          <AnalysisChat
            extraction={extraction}
            computedData={computedData || {}}
            swishScore={swishScore}
            suggestions={suggestions}
          />
        </div>
      </Collapsible>

      {/* Action bar */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleShare}
          disabled={shareState === "capturing"}
          className="py-2.5 px-3 bg-surface hover:bg-surface-light border border-border rounded-xl transition-colors text-xs font-bold uppercase tracking-wider text-muted hover:text-foreground cursor-pointer disabled:opacity-50"
        >
          {shareState === "copied" ? "Copied!" : shareState === "downloaded" ? "Downloaded!" : shareState === "capturing" ? "Capturing..." : "Share"}
        </button>
        <button
          onClick={onReset}
          className="py-2.5 px-3 bg-accent hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors text-xs uppercase tracking-wider cursor-pointer"
        >
          New Bet
        </button>
      </div>

      {/* Tiny feedback footer */}
      <div className="pt-2 border-t border-border/30">
        <FeedbackShare extraction={extraction} summary={summary} gameStatus={gameStatus} />
      </div>
    </div>
  );
}

function Collapsible({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-surface rounded-xl border border-border/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
        aria-expanded={open}
      >
        <span className="text-xs uppercase tracking-widest font-bold text-muted flex items-center gap-2">
          {label}
          {count != null && count > 0 && (
            <span className="text-[10px] bg-surface-light text-muted px-1.5 py-0.5 rounded tabular-nums">{count}</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function CompactTable({ chart }: { chart: ChartConfig }) {
  const cols = chart.columns || Object.keys(chart.data[0] || {}).map((k) => ({ key: k, label: k }));
  return (
    <div className="bg-surface rounded-xl border border-border/50 p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-widest font-bold text-muted mb-2">
        {chart.title}
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/60">
              {cols.map((c) => (
                <th key={c.key} className="text-left py-1.5 pr-3 text-muted font-bold uppercase tracking-wider text-[10px] whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.data.map((row, i) => (
              <tr key={i} className="border-b border-border/20 last:border-0">
                {cols.map((c, j) => (
                  <td key={c.key} className={`py-1.5 pr-3 tabular-nums whitespace-nowrap ${j === 0 ? "text-muted" : "font-semibold"}`}>
                    {String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {chart.relevance && (
        <p className="text-[11px] text-muted/80 mt-2 leading-relaxed">{chart.relevance}</p>
      )}
    </div>
  );
}

function InsightGroup({
  title,
  accent,
  bullets,
}: {
  title: string;
  accent: "emerald" | "red" | "muted";
  bullets: { label: string; value: string; tone: "pos" | "neg" | "neutral" }[];
}) {
  const styles =
    accent === "emerald"
      ? { box: "bg-emerald-500/[0.04] border-emerald-500/30", title: "text-emerald-400", value: "text-emerald-300" }
      : accent === "red"
        ? { box: "bg-red-500/[0.04] border-red-500/30", title: "text-red-400", value: "text-red-300" }
        : { box: "bg-surface border-border/50", title: "text-muted", value: "text-foreground" };
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${styles.box}`}>
      <div className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${styles.title}`}>
        {title}
      </div>
      <div className="space-y-1.5">
        {bullets.map((b, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted truncate">{b.label}</span>
            <span className={`font-bold tabular-nums text-right whitespace-nowrap ${styles.value}`}>
              {b.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectionPill({
  projection,
  line,
}: {
  projection: NonNullable<MLBInsights["projection"]>;
  line?: number;
}) {
  const { proj, diff, lean, edge } = projection;
  const sign = diff > 0 ? "+" : "";
  const tone =
    lean.startsWith("strong over") || lean === "lean over"
      ? "pos"
      : lean.startsWith("strong under") || lean === "lean under"
        ? "neg"
        : "neutral";
  const toneClass =
    tone === "pos"
      ? "bg-emerald-500/[0.06] border-emerald-500/40"
      : tone === "neg"
        ? "bg-red-500/[0.06] border-red-500/40"
        : "bg-surface-light border-border/60";
  const accentText =
    tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : "text-muted";
  // Edge meter: clamp to ±50% range visually
  const pctOfRange = Math.max(-1, Math.min(1, edge / 0.5));
  const fillPct = Math.abs(pctOfRange) * 50; // 0..50% of bar width
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-widest font-bold text-muted">L10 Projection</span>
          <span className="text-lg font-black tabular-nums text-foreground">{proj}</span>
          {line != null && (
            <span className="text-[11px] text-muted tabular-nums">vs {line}</span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-bold tabular-nums ${accentText}`}>{sign}{diff}</span>
          <span className={`text-[10px] uppercase tracking-widest font-black ${accentText}`}>{lean}</span>
        </div>
      </div>
      {/* Edge meter — center anchor, fills left or right based on sign */}
      <div className="relative h-1.5 bg-border/50 rounded-full overflow-hidden">
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-foreground/30" />
        <div
          className={`absolute top-0 bottom-0 ${
            pctOfRange >= 0 ? "left-1/2 bg-emerald-500" : "right-1/2 bg-red-500"
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}
