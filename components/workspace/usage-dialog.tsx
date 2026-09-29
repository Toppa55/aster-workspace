"use client";
import { ExternalLink } from "lucide-react";
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
import { providerMetadata } from "@/lib/ai/catalog";
import type { ProviderType } from "@/lib/ai/types";

export function UsageDialog({
  open,
  onOpenChange,
  rows,
  monthlyRows,
  budget,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: UsageRow[];
  monthlyRows: UsageRow[];
  budget: number;
}) {
  const spend = rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const monthlySpend = monthlyRows.reduce(
    (sum, row) => sum + Number(row.cost_usd || 0),
    0,
  );
  const remaining = Math.max(0, budget - monthlySpend);
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
            Provider-reported tokens with locally calculated prices. Your
            provider invoice remains the final amount.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          {[
            ["All-time spend", formatUsd(spend)],
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
          <div className="flex items-center gap-4">
            <div>
              <div className="text-sm text-muted-foreground">
                Estimated remaining this month
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {formatUsd(remaining)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {formatUsd(monthlySpend)} used of {formatUsd(budget)} local
                budget
              </div>
            </div>
            <div className="ml-auto text-sm font-medium">
              {budget
                ? Math.min(100, (monthlySpend / budget) * 100).toFixed(0)
                : 0}
              %
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{
                width: `${budget ? Math.min(100, (monthlySpend / budget) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            This is a local spending limit, not your provider’s prepaid credit
            balance. Check the provider billing page for the authoritative
            balance.
          </p>
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
                  <td className="p-3">
                    {r.priced === false
                      ? "Unpriced"
                      : formatUsd(Number(r.cost_usd || 0))}
                    {r.estimated && r.priced !== false ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        est.
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Actual balances:</span>
          {[...new Set(rows.map((row) => row.provider))].map((provider) => {
            const metadata = providerMetadata[provider as ProviderType];
            if (!metadata?.billingUrl) return null;
            return (
              <a
                key={provider}
                href={metadata.billingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 hover:bg-accent"
              >
                {metadata.name} billing <ExternalLink className="size-3" />
              </a>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatUsd(value: number) {
  if (value > 0 && value < 0.0001) return "<$0.0001";
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(2)}`;
}
