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
} from "recharts";
import type { ChartConfig } from "@/types";

const COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6"];

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

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
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
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {ys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
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
