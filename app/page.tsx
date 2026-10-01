/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Receipt = {
  id: string;
  vendor: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  status: "PENDING" | "PROCESSING" | "REVIEW_REQUIRED" | "COMPLETED" | "ERROR";
  createdAt: string;
  expense: {
    category: string | null;
    gifiCode: string | null;
    eligibleItc: string | null;
    itcStatus: "ELIGIBLE" | "PARTIAL" | "INELIGIBLE" | "REVIEW" | null;
    classificationStatus:
      "PENDING" | "CLASSIFIED" | "REVIEW_REQUIRED" | "REJECTED";
  } | null;
};

export default function DashboardPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchReceipts() {
    const response = await fetch("/api/receipts", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Receipt API returned ${response.status}`);
    }

    const result = await response.json();

    if (!Array.isArray(result.data)) {
      throw new Error("Invalid receipt API response");
    }

    return result.data as Receipt[];
  }

  async function loadReceipts() {
    try {
      setLoading(true);
      setError("");

      const data = await fetchReceipts();

      setReceipts(data);
    } catch (err) {
      console.error("Failed to load receipts:", err);

      setError(err instanceof Error ? err.message : "Unable to load receipts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialReceipts() {
      try {
        const data = await fetchReceipts();

        if (!cancelled) {
          setReceipts(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load receipts:", err);
          setError(
            err instanceof Error ? err.message : "Unable to load receipts",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInitialReceipts();

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () => ({
      total: receipts.length,
      pending: receipts.filter(
        (receipt) =>
          receipt.status === "PENDING" || receipt.status === "PROCESSING",
      ).length,
      review: receipts.filter((receipt) => receipt.status === "REVIEW_REQUIRED")
        .length,
      completed: receipts.filter((receipt) => receipt.status === "COMPLETED")
        .length,
    }),
    [receipts],
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Loopnow CPA</p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Receipt Processing
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Receipt Processing &amp; GST/HST Bookkeeping
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
            </p>
          </div>

          <button
            onClick={loadReceipts}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50"
          >
            Refresh
          </button>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total receipts" value={stats.total} />
          <StatCard label="Pending" value={stats.pending} />
          <StatCard label="Needs review" value={stats.review} />
          <StatCard label="Completed" value={stats.completed} />
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-semibold">Receipts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review and inspect processed receipts.
            </p>
          </div>

          {loading && (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              Loading receipts...
            </div>
          )}

          {!loading && error && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-red-600">{error}</p>

              <button
                onClick={loadReceipts}
                className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && receipts.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No receipts found.
            </div>
          )}

          {!loading && !error && receipts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Vendor</th>
                    <th className="px-6 py-4 font-medium">Amount</th>
                    <th className="px-6 py-4 font-medium">Classification</th>
                    <th className="px-6 py-4 font-medium">GIFI</th>
                    <th className="px-6 py-4 font-medium">ITC</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {receipts.map((receipt) => (
                    <tr
                      key={receipt.id}
                      className="transition hover:bg-slate-50"
                    >
                      <td className="px-6 py-5">
                        <div className="font-medium">{receipt.vendor}</div>

                        <div className="mt-1 text-xs text-slate-400">
                          {new Date(receipt.createdAt).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="px-6 py-5 font-medium">
                        ${Number(receipt.total).toFixed(2)}
                      </td>

                      <td className="px-6 py-5">
                        {receipt.expense?.category ?? "—"}
                      </td>

                      <td className="px-6 py-5 font-mono text-xs">
                        {receipt.expense?.gifiCode ?? "—"}
                      </td>

                      <td className="px-6 py-5">
                        ${Number(receipt.expense?.eligibleItc ?? 0).toFixed(2)}
                      </td>

                      <td className="px-6 py-5">
                        <StatusBadge status={receipt.status} />
                      </td>

                      <td className="px-6 py-5 text-right">
                        <Link
                          href={`/receipts/${receipt.id}`}
                          className="font-medium text-blue-600 hover:text-blue-700"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Receipt["status"] }) {
  const styles: Record<Receipt["status"], string> = {
    PENDING: "bg-amber-50 text-amber-700",
    PROCESSING: "bg-blue-50 text-blue-700",
    REVIEW_REQUIRED: "bg-orange-50 text-orange-700",
    COMPLETED: "bg-emerald-50 text-emerald-700",
    ERROR: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
