"use client";

import { useRef, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  LabelList,
} from "recharts";
import type { ChartConfig } from "@/types";
import { captureWithWatermark, copyImageToClipboard, downloadBlob } from "@/lib/captureWithWatermark";

// Props.cash-inspired color palette — vibrant on dark backgrounds
const COLORS = ["#22c55e", "#818cf8", "#38bdf8", "#f87171", "#a78bfa", "#fb923c"];

// Special keys get specific styling
const KEY_STYLES: Record<string, { color: string; dash?: string; width?: number; opacity?: number }> = {
  rollingAvg: { color: "#818cf8", width: 2.5 },
  rollingMargin: { color: "#818cf8", width: 2.5 },
  rollingTotal: { color: "#f59e0b", width: 2, dash: "4 2" },
};

export default function ChartDisplay({ config, extraction }: { config: ChartConfig; extraction?: { sport?: string; betType?: string; market?: string; description?: string } }) {
  const { type, title, relevance, data, xKey, yKeys, columns } = config;
  const chartRef = useRef<HTMLDivElement>(null);
  const [shareState, setShareState] = useState<"idle" | "capturing" | "copied" | "downloaded">("idle");
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const [window, setWindow] = useState<number | null>(null); // null = all data

  // Time window filter — applies to hitrate, line, and bar charts (not tables)
  const showToggle = type !== "table" && data.length > 10;
  const windowOptions = [
    { label: "L5", value: 5 },
    { label: "L10", value: 10 },
    { label: "L20", value: 20 },
    { label: "All", value: null },
  ];
  const filteredData = window != null ? data.slice(-window) : data;

  const handleShare = useCallback(async () => {
    if (!chartRef.current) return;
    setShareState("capturing");
    try {
      const blob = await captureWithWatermark(chartRef.current, "swish-chart.png");
      if (!blob) { setShareState("idle"); return; }
      const didCopy = await copyImageToClipboard(blob, "swish-chart.png");
      setShareState(didCopy ? "copied" : "downloaded");
    } catch {
      setShareState("idle");
      return;
    }
    setTimeout(() => setShareState("idle"), 2000);
  }, []);

  const handleRate = useCallback(async (rating: "up" | "down") => {
    setRated(rating);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          type: "chart",
          chart: title,
          bet: extraction ? {
            sport: extraction.sport,
            betType: extraction.betType,
            market: extraction.market,
            description: extraction.description,
          } : undefined,
        }),
      });
    } catch { /* silent */ }
  }, [title, extraction]);

  return (
    <div ref={chartRef} className="bg-surface rounded-xl p-4 sm:p-5 space-y-3 relative group border border-border/50 hover:border-border transition-colors">
      {/* Action buttons — top-right, visible on hover */}
      <div className="absolute top-3 right-3 z-10 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all">
        {rated ? (
          <span className="p-1.5 text-xs text-muted">{rated === "up" ? "Thanks!" : "Noted"}</span>
        ) : (
          <>
            <button
              onClick={() => handleRate("up")}
              className="p-1.5 rounded-lg bg-surface-light/80 hover:bg-emerald-500/20 text-muted hover:text-emerald-400 transition-colors cursor-pointer"
              aria-label="Relevant"
              title="This chart is relevant"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>
            </button>
            <button
              onClick={() => handleRate("down")}
              className="p-1.5 rounded-lg bg-surface-light/80 hover:bg-red-500/20 text-muted hover:text-red-400 transition-colors cursor-pointer"
              aria-label="Not relevant"
              title="Not relevant to this bet"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>
            </button>
          </>
        )}
        <button
          onClick={handleShare}
          disabled={shareState === "capturing"}
          className="p-1.5 rounded-lg bg-surface-light/80 hover:bg-border text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
          aria-label="Share chart"
          title={shareState === "copied" ? "Copied!" : shareState === "downloaded" ? "Downloaded!" : "Share"}
        >
          {shareState === "copied" ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          ) : shareState === "downloaded" ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          ) : shareState === "capturing" ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
          )}
        </button>
      </div>

      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">{title}</h3>
            <p className="text-muted text-xs leading-relaxed">{relevance}</p>
          </div>
          {showToggle && (
            <div className="flex gap-1 flex-shrink-0">
              {windowOptions.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setWindow(opt.value)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                    window === opt.value
                      ? "bg-accent text-black"
                      : "bg-surface-light text-muted hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {type === "table" ? (
        <TableChart data={data} columns={columns} />
      ) : type === "line" ? (
        <RechartsLine data={filteredData} xKey={xKey} yKeys={yKeys} />
      ) : type === "hitrate" ? (
        <RechartsHitRate data={filteredData} xKey={xKey} />
      ) : (
        <RechartsBar
          data={filteredData}
          xKey={xKey}
          yKeys={yKeys}
          isDistribution={type === "distribution"}
        />
      )}
    </div>
  );
}

function RechartsLine({
  data,
  xKey,
  yKeys,
}: {
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: string[];
}) {
  const x = xKey || Object.keys(data[0] || {})[0];
  const ys =
    yKeys || Object.keys(data[0] || {}).filter((k) => k !== x);

  // Detect if propLine/ouLine is a constant reference line
  const refLineKeys = ys.filter((k) => {
    const vals = data.map((d) => Number(d[k])).filter((v) => !isNaN(v));
    return vals.length > 1 && vals.every((v) => v === vals[0]) && vals[0] > 0;
  });
  const regularKeys = ys.filter((k) => !refLineKeys.includes(k));
  const refLineValue = refLineKeys.length > 0 ? Number(data[0]?.[refLineKeys[0]]) : null;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
        <XAxis
          dataKey={x}
          tick={{ fill: "#888", fontSize: 10 }}
          stroke="#333"
          angle={-30}
          textAnchor="end"
          height={50}
        />
        <YAxis tick={{ fill: "#888", fontSize: 11 }} stroke="#333" />
        <Tooltip
          contentStyle={{
            background: "#111",
            border: "1px solid #333",
            borderRadius: 10,
            fontSize: 12,
            padding: "8px 12px",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {refLineValue != null && (
          <ReferenceLine
            y={refLineValue}
            stroke="#f59e0b"
            strokeDasharray="6 4"
            strokeWidth={2}
            label={{ value: `Line: ${refLineValue}`, fill: "#f59e0b", fontSize: 11, position: "right" }}
          />
        )}
        {regularKeys.map((key, i) => {
          const style = KEY_STYLES[key];
          return (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={style?.color || COLORS[i % COLORS.length]}
              strokeWidth={style?.width || 2}
              strokeDasharray={style?.dash}
              dot={style?.dash ? false : { r: 3 }}
              connectNulls
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

function RechartsHitRate({
  data,
  xKey,
}: {
  data: Record<string, unknown>[];
  xKey?: string;
}) {
  const x = xKey || "game";
  const lineValue = typeof data[0]?.line === "number" ? (data[0].line as number) : null;
  const [splitFilter, setSplitFilter] = useState<string | null>(null);

  // Compute hit rates for summary row
  const hitRatePct = (arr: Record<string, unknown>[]) => {
    if (arr.length === 0) return null;
    const hits = arr.filter((d) => d.overLine).length;
    return Math.round((hits / arr.length) * 100);
  };

  const allRate = hitRatePct(data);
  const l5Rate = hitRatePct(data.slice(-5));
  const l10Rate = hitRatePct(data.slice(-10));
  const l20Rate = hitRatePct(data.slice(-20));

  // Split filters — only show if data has home/away info
  const hasHomeAway = data.some((d) => typeof d.home === "boolean");
  const splitOptions = hasHomeAway
    ? [
        { label: "All", value: null },
        { label: "Home", value: "home" },
        { label: "Away", value: "away" },
      ]
    : [];

  const displayData = splitFilter
    ? data.filter((d) => (splitFilter === "home" ? d.home : !d.home))
    : data;

  const rateColor = (pct: number | null) =>
    pct == null ? "text-muted" : pct >= 60 ? "text-emerald-400" : pct <= 40 ? "text-red-400" : "text-foreground";

  return (
    <div className="space-y-2">
      {/* Hit rate summary row — props.cash style */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs justify-center">
        {[
          { label: "Season", pct: allRate },
          { label: "L5", pct: l5Rate },
          { label: "L10", pct: l10Rate },
          { label: "L20", pct: l20Rate },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className="text-muted">{item.label}</span>
            <span className={`font-bold ${rateColor(item.pct)}`}>
              {item.pct != null ? `${item.pct}%` : "—"}
            </span>
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={displayData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
          <XAxis
            dataKey={x}
            tick={{ fill: "#888", fontSize: 10 }}
            stroke="#333"
            angle={-30}
            textAnchor="end"
            height={50}
          />
          <YAxis tick={{ fill: "#888", fontSize: 11 }} stroke="#333" />
          <Tooltip
            contentStyle={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 10,
              fontSize: 12,
              padding: "8px 12px",
            }}
            formatter={(val, _name, props) => {
              const over = (props as unknown as { payload: Record<string, unknown> }).payload?.overLine;
              return [String(val), over ? "OVER" : "UNDER"];
            }}
          />
          {lineValue != null && (
            <ReferenceLine
              y={lineValue}
              stroke="#f59e0b"
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{ value: `${lineValue}`, fill: "#f59e0b", fontSize: 11, position: "right" }}
            />
          )}
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            <LabelList dataKey="value" position="top" fill="#ccc" fontSize={11} fontWeight={700} />
            {displayData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.overLine ? "#22c55e" : "#ef4444"}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Split filter pills — HOME / AWAY */}
      {splitOptions.length > 0 && (
        <div className="flex gap-1.5 justify-center pt-1">
          {splitOptions.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setSplitFilter(opt.value)}
              className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full transition-colors cursor-pointer ${
                splitFilter === opt.value
                  ? "bg-accent text-black"
                  : "bg-surface-light text-muted hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RechartsBar({
  data,
  xKey,
  yKeys,
  isDistribution,
}: {
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: string[];
  isDistribution?: boolean;
}) {
  const x = xKey || Object.keys(data[0] || {})[0];
  const ys =
    yKeys || Object.keys(data[0] || {}).filter((k) => k !== x);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
        <XAxis
          dataKey={x}
          tick={{ fill: "#888", fontSize: 11 }}
          stroke="#333"
        />
        <YAxis tick={{ fill: "#888", fontSize: 11 }} stroke="#333" />
        <Tooltip
          contentStyle={{
            background: "#111",
            border: "1px solid #333",
            borderRadius: 10,
            fontSize: 12,
            padding: "8px 12px",
          }}
        />
        {!isDistribution && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {ys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={COLORS[i % COLORS.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function TableChart({
  data,
  columns,
}: {
  data: Record<string, unknown>[];
  columns?: { key: string; label: string }[];
}) {
  const cols =
    columns ||
    Object.keys(data[0] || {}).map((k) => ({ key: k, label: k }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {cols.map((col) => (
              <th
                key={col.key}
                className="text-left py-2.5 px-3 text-muted font-semibold text-xs uppercase tracking-wider whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border/30 hover:bg-surface-light/50 transition-colors">
              {cols.map((col, j) => (
                <td key={col.key} className={`py-2.5 px-3 text-xs whitespace-nowrap ${j === 0 ? "text-muted" : "font-medium"}`}>
                  {String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
