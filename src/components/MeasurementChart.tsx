import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate } from "../lib/dates.ts";
import { formatMeasure } from "../lib/numbers.ts";

export type MeasurementPoint = {
  date: string;
  label: string;
  value: number;
};

export default function MeasurementChart({ points, unit, name }: { points: MeasurementPoint[]; unit: string; name: string }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#2c313c" vertical={false} />
          <XAxis dataKey="label" stroke="#9aa3b2" tick={{ fill: "#9aa3b2", fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis
            stroke="#9aa3b2"
            tick={{ fill: "#9aa3b2", fontSize: 12 }}
            width={44}
            domain={["auto", "auto"]}
            tickFormatter={(value: number) => formatMeasure(value)}
          />
          <Tooltip
            contentStyle={{ background: "#14161c", border: "1px solid #2c313c", borderRadius: 12 }}
            labelFormatter={(_label, payload) => {
              const date = payload?.[0]?.payload?.date;
              return typeof date === "string" ? formatDate(date) : "";
            }}
            formatter={(value) => {
              const numeric = typeof value === "number" ? value : Number(value ?? 0);
              return [`${formatMeasure(numeric)} ${unit}`, name];
            }}
          />
          <Line type="monotone" dataKey="value" name={name} stroke="#d6ff4a" strokeWidth={2} dot={points.length < 12} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
