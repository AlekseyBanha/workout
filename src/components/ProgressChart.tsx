import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { uk } from "../i18n/uk.ts";
import { formatDate } from "../lib/dates.ts";
import { formatWeight } from "../lib/numbers.ts";
import type { ProgressPoint } from "../lib/progression.ts";

export default function ProgressChart({ points }: { points: ProgressPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#2c313c" vertical={false} />
          <XAxis dataKey="label" stroke="#9aa3b2" tick={{ fill: "#9aa3b2", fontSize: 12 }} />
          <YAxis yAxisId="weight" stroke="#9aa3b2" tick={{ fill: "#9aa3b2", fontSize: 12 }} width={40} />
          <YAxis yAxisId="reps" orientation="right" stroke="#9aa3b2" tick={{ fill: "#9aa3b2", fontSize: 12 }} width={28} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "#14161c", border: "1px solid #2c313c", borderRadius: 12 }}
            labelFormatter={(_label, payload) => {
              const date = payload?.[0]?.payload?.date;
              return typeof date === "string" ? formatDate(date) : "";
            }}
            formatter={(value, name) => {
              const numeric = typeof value === "number" ? value : Number(value ?? 0);
              if (name === uk.detail.reps) return [String(Math.round(numeric)), name];
              return [`${formatWeight(numeric)} ${uk.kg}`, name];
            }}
          />
          <Legend />
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="maxWeight"
            name={uk.detail.maxWeight}
            stroke="#d6ff4a"
            strokeWidth={2}
            dot={points.length < 8}
          />
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="oneRm"
            name={uk.detail.oneRm}
            stroke="#ffc14a"
            strokeWidth={2}
            dot={points.length < 8}
          />
          <Line
            yAxisId="reps"
            type="monotone"
            dataKey="reps"
            name={uk.detail.reps}
            stroke="#8eb6ff"
            strokeWidth={2}
            dot={points.length < 8}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
