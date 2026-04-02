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

const embiidTipoffs = [
  { month: "Oct", winPct: 58 },
  { month: "Nov", winPct: 65 },
  { month: "Dec", winPct: 71 },
  { month: "Jan", winPct: 63 },
  { month: "Feb", winPct: 68 },
  { month: "Mar", winPct: 72 },
];

const henryTDs = [
  { game: "G1", tds: 2 },
  { game: "G2", tds: 0 },
  { game: "G3", tds: 1 },
  { game: "G4", tds: 3 },
  { game: "G5", tds: 1 },
  { game: "G6", tds: 2 },
  { game: "G7", tds: 0 },
  { game: "G8", tds: 1 },
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

const haliburtonAssists = [
  { game: "G1", ast: 12 },
  { game: "G2", ast: 8 },
  { game: "G3", ast: 11 },
  { game: "G4", ast: 7 },
  { game: "G5", ast: 14 },
  { game: "G6", ast: 9 },
  { game: "G7", ast: 13 },
  { game: "G8", ast: 10 },
];

const examples = [
  {
    betLabel: "Embiid First Basket +450",
    insight: "Wins 66% of tips and takes the first shot 82% of the time. That +450 is juicy.",
    badge: "NBA PROP",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={embiidTipoffs} barSize={16}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="month" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[40, 80]} hide />
          <Tooltip
            contentStyle={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="winPct" fill="#10b981" radius={[4, 4, 0, 0]} name="Tip win %" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "Tip win %", value: "66%" },
      { label: "1st shot %", value: "82%" },
      { label: "1st basket", value: "12%" },
    ],
  },
  {
    betLabel: "Derrick Henry ATTD -115",
    insight: "Scored in 6 of his last 8. Gets 80% of goal-line carries. This is the safest leg on your card.",
    badge: "NFL PROP",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={henryTDs} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="game" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 4]} hide />
          <Tooltip
            contentStyle={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <ReferenceLine y={0.5} stroke="#10b981" strokeDasharray="5 3" />
          <Bar dataKey="tds" fill="#10b981" radius={[4, 4, 0, 0]} name="TDs" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "TD rate", value: "75%" },
      { label: "GL carries", value: "80%" },
      { label: "Avg TDs", value: "1.3" },
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
    betLabel: "Haliburton O 9.5 Assists -120",
    insight: "Cleared 9.5 in 6 of his last 8. Averaging 10.5 dimes this month. This line hasn't caught up.",
    badge: "PLAYER PROP",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={haliburtonAssists} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="game" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 16]} hide />
          <Tooltip
            contentStyle={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <ReferenceLine y={9.5} stroke="#a855f7" strokeDasharray="5 3" />
          <Bar dataKey="ast" fill="#a855f7" radius={[4, 4, 0, 0]} name="Assists" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "Last 8 avg", value: "10.5" },
      { label: "Over rate", value: "75%" },
      { label: "vs line", value: "+1.0" },
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
          Not box scores. The specific numbers for your specific bet — props, spreads, totals, any sport.
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
