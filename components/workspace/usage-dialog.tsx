"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UsageRow } from "./types";

export function UsageDialog({
  open,
  onOpenChange,
  rows,
  budget,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: UsageRow[];
  budget: number;
}) {
  const spend = rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const requests = rows.reduce((s, r) => s + Number(r.requests || 0), 0);
  const input = rows.reduce((s, r) => s + Number(r.input_tokens || 0), 0);
  const output = rows.reduce((s, r) => s + Number(r.output_tokens || 0), 0);
  const chart = rows.slice(0, 8).map((r) => ({
    name: r.model.length > 18 ? `${r.model.slice(0, 16)}…` : r.model,
    cost: Number(r.cost_usd || 0),
  }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Usage & costs</DialogTitle>
          <DialogDescription>
            Reported token usage and locally estimated cost. Unknown model
            prices remain unpriced.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          {[
            ["Total spend", `$${spend.toFixed(4)}`],
            ["Requests", requests.toLocaleString()],
            ["Input tokens", input.toLocaleString()],
            ["Output tokens", output.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-xl font-semibold">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 rounded-xl border bg-card p-4">
          <div className="flex items-center">
            <div>
              <div className="font-medium">Monthly budget</div>
              <div className="text-sm text-muted-foreground">
                Estimated remaining ${Math.max(0, budget - spend).toFixed(2)} of
                ${budget.toFixed(2)}
              </div>
            </div>
            <div className="ml-auto text-sm font-medium">
              {budget ? Math.min(100, (spend / budget) * 100).toFixed(0) : 0}%
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{
                width: `${budget ? Math.min(100, (spend / budget) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
        <div className="mt-2 h-64 rounded-xl border bg-card p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#181a21",
                  border: "1px solid #343641",
                  borderRadius: 10,
                }}
              />
              <Bar dataKey="cost" fill="#7567ff" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="p-3">Provider</th>
                <th className="p-3">Model</th>
                <th className="p-3">Requests</th>
                <th className="p-3">Tokens</th>
                <th className="p-3">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.provider}-${r.model}`} className="border-t">
                  <td className="p-3 capitalize">{r.provider}</td>
                  <td className="p-3">{r.model}</td>
                  <td className="p-3">{r.requests}</td>
                  <td className="p-3">
                    {(
                      Number(r.input_tokens) + Number(r.output_tokens)
                    ).toLocaleString()}
                  </td>
                  <td className="p-3">${Number(r.cost_usd || 0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
