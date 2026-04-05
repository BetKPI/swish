"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import type { ChartConfig } from "@/types";

const COLORS = ["#10b981", "#6366f1", "#3b82f6", "#ef4444", "#8b5cf6"];

// Special keys get specific styling
const KEY_STYLES: Record<string, { color: string; dash?: string; width?: number; opacity?: number }> = {
  rollingAvg: { color: "#6366f1", width: 2.5 },
  rollingMargin: { color: "#6366f1", width: 2.5 },
  rollingTotal: { color: "#f59e0b", width: 2, dash: "4 2" },
};

export default function ChartDisplay({ config }: { config: ChartConfig }) {
  const { type, title, relevance, data, xKey, yKeys, columns } = config;

  return (
    <div className="bg-surface rounded-xl p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-muted text-xs">{relevance}</p>
      </div>

      {type === "table" ? (
        <TableChart data={data} columns={columns} />
      ) : type === "line" ? (
        <RechartsLine data={data} xKey={xKey} yKeys={yKeys} />
      ) : (
        <RechartsBar
          data={data}
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
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
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
            background: "#1a1a1a",
            border: "1px solid #333",
            borderRadius: 8,
            fontSize: 12,
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
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis
          dataKey={x}
          tick={{ fill: "#888", fontSize: 11 }}
          stroke="#333"
        />
        <YAxis tick={{ fill: "#888", fontSize: 11 }} stroke="#333" />
        <Tooltip
          contentStyle={{
            background: "#1a1a1a",
            border: "1px solid #333",
            borderRadius: 8,
            fontSize: 12,
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
                className="text-left py-2 px-2 text-muted font-medium text-xs"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {cols.map((col) => (
                <td key={col.key} className="py-2 px-2 text-xs">
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
