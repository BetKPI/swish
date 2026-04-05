"use client";

import { useState, useRef, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const brunsonPts = [
  { game: "ORL", pts: 23 },
  { game: "MIA", pts: 16 },
  { game: "BOS", pts: 31 },
  { game: "PHI", pts: 29 },
  { game: "CHI", pts: 36 },
  { game: "CLE", pts: 37 },
  { game: "MIL", pts: 31 },
  { game: "IND", pts: 23 },
];

const schefflerRounds = [
  { round: "R1 '24", score: 66 },
  { round: "R2 '24", score: 72 },
  { round: "R3 '24", score: 71 },
  { round: "R4 '24", score: 68 },
  { round: "R1 '25", score: 69 },
  { round: "R2 '25", score: 67 },
  { round: "R3 '25", score: 66 },
  { round: "R4 '25", score: 65 },
];

const lakersSpread = [
  { game: "G1", margin: 7 },
  { game: "G2", margin: -3 },
  { game: "G3", margin: 12 },
  { game: "G4", margin: -1 },
  { game: "G5", margin: 5 },
  { game: "G6", margin: -8 },
  { game: "G7", margin: 15 },
  { game: "G8", margin: 4 },
  { game: "G9", margin: -2 },
  { game: "G10", margin: 9 },
];

const flaggPts = [
  { game: "ORL", pts: 51 },
  { game: "MIL", pts: 19 },
  { game: "MIN", pts: 12 },
  { game: "POR", pts: 24 },
  { game: "DEN", pts: 26 },
  { game: "GS", pts: 32 },
  { game: "LAC", pts: 18 },
  { game: "ATL", pts: 17 },
];

const examples = [
  {
    betLabel: "Brunson O 26.5 Pts -115",
    insight: "Averaging 28.3 over his last 8 and cleared 26.5 in 5 of them. Rolling avg trending up.",
    badge: "NBA PROP",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={brunsonPts} barSize={16}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="game" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[10, 40]} hide />
          <Tooltip
            contentStyle={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <ReferenceLine y={26.5} stroke="#f59e0b" strokeDasharray="5 3" />
          <Bar dataKey="pts" fill="#10b981" radius={[4, 4, 0, 0]} name="Points" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "Last 8 avg", value: "28.3" },
      { label: "Over rate", value: "63%" },
      { label: "vs line", value: "+1.8" },
    ],
  },
  {
    betLabel: "Scheffler Top 5 Masters +300",
    insight: "Finished top 5 in 3 of his last 4 majors. Averaging 68.5 strokes per round at Augusta since 2022.",
    badge: "GOLF",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={schefflerRounds} barSize={16}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="round" tick={{ fill: "#555", fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis domain={[62, 75]} hide />
          <Tooltip
            contentStyle={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <ReferenceLine y={72} stroke="#10b981" strokeDasharray="5 3" />
          <Bar dataKey="score" fill="#10b981" radius={[4, 4, 0, 0]} name="Score" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "Avg round", value: "68.0" },
      { label: "Under par", value: "88%" },
      { label: "Top 5 rate", value: "75%" },
    ],
  },
  {
    betLabel: "Lakers -3.5 vs Celtics",
    insight: "Covered 6 of last 10 but 0-3 ATS as road dogs this year. Proceed with caution.",
    badge: "SPREAD",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={lakersSpread} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="game" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <ReferenceLine y={-3.5} stroke="#f59e0b" strokeDasharray="5 3" />
          <Bar dataKey="margin" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Margin" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "ATS", value: "6-4" },
      { label: "H2H", value: "2-1" },
      { label: "Avg margin", value: "+3.8" },
    ],
  },
  {
    betLabel: "Cooper Flagg O 24.5 Pts -110",
    insight: "The rookie is averaging 24.9 over his last 8 with a 51-point explosion mixed in. High variance but trending up.",
    badge: "PLAYER PROP",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={flaggPts} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="game" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 55]} hide />
          <Tooltip
            contentStyle={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <ReferenceLine y={24.5} stroke="#a855f7" strokeDasharray="5 3" />
          <Bar dataKey="pts" fill="#a855f7" radius={[4, 4, 0, 0]} name="Points" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "Last 8 avg", value: "24.9" },
      { label: "Over rate", value: "38%" },
      { label: "Std dev", value: "12.1" },
    ],
  },
];

export default function ExampleShowcase() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const scrollLeft = el.scrollLeft;
      const cardWidth = el.firstElementChild?.getBoundingClientRect().width ?? 240;
      const gap = 16;
      const idx = Math.round(scrollLeft / (cardWidth + gap));
      setActiveIndex(Math.min(idx, examples.length - 1));
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-accent text-sm font-semibold uppercase tracking-wider">
          How it works
        </p>
        <h3 className="text-2xl sm:text-3xl font-bold">
          The stats behind the bet
        </h3>
        <p className="text-muted text-sm max-w-lg mx-auto">
          Not box scores. The specific numbers for your specific bet — props, spreads, totals.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex lg:grid lg:grid-cols-4 gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-visible scrollbar-hide"
      >
        {examples.map((ex) => (
          <div
            key={ex.betLabel}
            className="bg-surface/80 border border-border/40 rounded-2xl p-3.5 space-y-2.5 hover:border-border transition-colors min-w-[220px] max-w-[72vw] snap-center shrink-0 lg:min-w-0 lg:max-w-none lg:shrink"
          >
            <div className="space-y-1.5">
              <span className="text-[10px] tracking-widest text-accent/70 font-semibold">
                {ex.badge}
              </span>
              <h4 className="font-bold text-sm">{ex.betLabel}</h4>
              <p className="text-muted text-xs leading-relaxed">{ex.insight}</p>
            </div>

            <div className="bg-background/60 rounded-xl p-1.5">
              {ex.chart}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {ex.stats.map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-sm font-bold">{s.value}</div>
                  <div className="text-[10px] text-muted uppercase tracking-wide">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Scroll indicator dots — mobile only */}
      <div className="flex justify-center gap-1.5 lg:hidden">
        {examples.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === activeIndex ? "bg-accent" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
