import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { uk } from "../i18n/uk.ts";
import { formatDate } from "../lib/dates.ts";
import type { TonnagePoint } from "../lib/progress.ts";

function formatTonnage(value: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(value);
}

export default function TonnageChart({ points }: { points: TonnagePoint[] }) {
  return (
    <div className="h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#2c313c" vertical={false} />
          <XAxis dataKey="label" stroke="#9aa3b2" tick={{ fill: "#9aa3b2", fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis stroke="#9aa3b2" tick={{ fill: "#9aa3b2", fontSize: 12 }} width={44} />
          <Tooltip
            contentStyle={{ background: "#14161c", border: "1px solid #2c313c", borderRadius: 12 }}
            labelFormatter={(_label, payload) => {
              const week = payload?.[0]?.payload?.week;
              return typeof week === "string" ? formatDate(week) : "";
            }}
            formatter={(value) => {
              const numeric = typeof value === "number" ? value : Number(value ?? 0);
              return [`${formatTonnage(numeric)} ${uk.kg}`, uk.progress.tonnage];
            }}
          />
          <Line
            type="monotone"
            dataKey="tonnage"
            name={uk.progress.tonnage}
            stroke="#d6ff4a"
            strokeWidth={2}
            dot={points.length < 8}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
