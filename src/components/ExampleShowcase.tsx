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

// Anytime HR - 1 = homer, 0 = none. Visualizes "10 of last 20" rate.
const judgeHR = [
  { game: "BOS", hit: 0 },
  { game: "TOR", hit: 1 },
  { game: "TB", hit: 1 },
  { game: "BAL", hit: 0 },
  { game: "CLE", hit: 0 },
  { game: "DET", hit: 1 },
  { game: "MIN", hit: 1 },
  { game: "HOU", hit: 0 },
  { game: "TEX", hit: 1 },
  { game: "SEA", hit: 1 },
];

const skenesK = [
  { game: "MIL", k: 9 },
  { game: "STL", k: 11 },
  { game: "CHC", k: 7 },
  { game: "CIN", k: 10 },
  { game: "PHI", k: 12 },
  { game: "ATL", k: 8 },
  { game: "NYM", k: 9 },
  { game: "WAS", k: 10 },
];

const sgaPts = [
  { game: "DAL", pts: 38 },
  { game: "MIN", pts: 32 },
  { game: "DEN", pts: 41 },
  { game: "MEM", pts: 28 },
  { game: "LAL", pts: 35 },
  { game: "GSW", pts: 33 },
  { game: "PHX", pts: 39 },
  { game: "SAC", pts: 30 },
];

const mcdavidPts = [
  { game: "VGK", pts: 2 },
  { game: "DAL", pts: 1 },
  { game: "WPG", pts: 3 },
  { game: "COL", pts: 0 },
  { game: "LA", pts: 2 },
  { game: "VAN", pts: 1 },
  { game: "CGY", pts: 2 },
  { game: "SEA", pts: 4 },
];

const examples = [
  {
    betLabel: "Judge Anytime HR +210",
    insight: "Homered in 30% of games over his last 20. Park HR factor +6% at Yankee Stadium - and tonight's pitcher allows 1.6 HR/9.",
    badge: "MLB ANYTIME",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={judgeHR} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="game" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 1]} hide />
          <Tooltip contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="hit" fill="#10b981" radius={[4, 4, 0, 0]} name="HR" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "L20 HR rate", value: "30%" },
      { label: "Barrel%", value: "21.4" },
      { label: "Park factor", value: "+6%" },
    ],
  },
  {
    betLabel: "Skenes O 7.5 Ks -135",
    insight: "Cleared 7.5 K's in 6 of last 8 starts. Slider has 41% whiff rate and tonight's lineup ranks 3rd in K%.",
    badge: "MLB PITCHER",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={skenesK} barSize={16}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="game" tick={{ fill: "#555", fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis domain={[5, 14]} hide />
          <Tooltip contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 8, fontSize: 12 }} />
          <ReferenceLine y={7.5} stroke="#f59e0b" strokeDasharray="5 3" />
          <Bar dataKey="k" fill="#3b82f6" radius={[4, 4, 0, 0]} name="K's" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "L8 avg", value: "9.5" },
      { label: "Over rate", value: "75%" },
      { label: "Slider whiff%", value: "41" },
    ],
  },
  {
    betLabel: "SGA O 32.5 Pts -110",
    insight: "Averages 34.5 in playoffs and 39.4 in last 3. Opp ranks 22nd in defensive rating - he doesn't get held under 30 here.",
    badge: "NBA PLAYOFFS",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={sgaPts} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="game" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[20, 45]} hide />
          <Tooltip contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 8, fontSize: 12 }} />
          <ReferenceLine y={32.5} stroke="#f59e0b" strokeDasharray="5 3" />
          <Bar dataKey="pts" fill="#a855f7" radius={[4, 4, 0, 0]} name="Points" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "Playoff avg", value: "34.5" },
      { label: "Over rate", value: "75%" },
      { label: "vs line", value: "+2.0" },
    ],
  },
  {
    betLabel: "McDavid O 1.5 Points +105",
    insight: "Multi-point game in 7 of last 10. Opp PK ranks 28th and Edmonton averaged 3.2 PPG in this matchup.",
    badge: "NHL PLAYOFFS",
    chart: (
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={mcdavidPts} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="game" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 5]} hide />
          <Tooltip contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 8, fontSize: 12 }} />
          <ReferenceLine y={1.5} stroke="#f59e0b" strokeDasharray="5 3" />
          <Bar dataKey="pts" fill="#ef4444" radius={[4, 4, 0, 0]} name="Points" />
        </BarChart>
      </ResponsiveContainer>
    ),
    stats: [
      { label: "L10 avg", value: "1.8" },
      { label: "Multi-pt rate", value: "70%" },
      { label: "Opp PK rank", value: "28" },
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
          Not box scores. The specific numbers for your specific bet - props, spreads, totals.
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

      {/* Scroll indicator dots - mobile only */}
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
