"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Approval = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EDITED";
  proposedCategory: string | null;
  proposedGifiCode: string | null;
  proposedItc: string | null;
  reason: string | null;
  reviewer: string | null;
  decision: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type AuditEvent = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  status: "SUCCESS" | "FAILURE" | "REVIEW_REQUIRED";
  ruleVersion: string | null;
  model: string | null;
  metadata: Record<string, unknown> | null;
};

type Receipt = {
  id: string;
  vendor: string;
  receiptDate: string | null;
  description: string | null;
  subtotal: string;
  taxAmount: string;
  total: string;
  taxType: string | null;
  gstHstNumber: string | null;
  commercialUsePercentage: string | null;
  category: string | null;
  receiptAvailable: boolean;
  status: "PENDING" | "PROCESSING" | "REVIEW_REQUIRED" | "COMPLETED" | "ERROR";
  createdAt: string;
  updatedAt: string;

  expense: {
    category: string | null;
    gifiCode: string | null;
    commercialUsePercentage: string | null;
    grossTax: string | null;
    eligibilityPercentage: string | null;
    eligibleItc: string | null;
    itcStatus: "ELIGIBLE" | "PARTIAL" | "INELIGIBLE" | "REVIEW" | null;
    classificationStatus:
      "PENDING" | "CLASSIFIED" | "REVIEW_REQUIRED" | "REJECTED";
    confidence: string | null;
    reason: string | null;
  } | null;

  approvals: Approval[];
  auditEvents: AuditEvent[];
};

export default function ReceiptDetailsPage() {
  const params = useParams<{ id: string }>();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);

  const receiptId = params.id;

  async function loadReceipt() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/receipts/${receiptId}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Receipt not found");
        }

        throw new Error("Failed to load receipt");
      }

      const result = await response.json();

      setReceipt(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load receipt");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialReceipt() {
      try {
        const response = await fetch(`/api/receipts/${receiptId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Receipt not found");
          }

          throw new Error("Failed to load receipt");
        }

        const result = await response.json();

        if (!cancelled) {
          setReceipt(result.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load receipt",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (receiptId) {
      loadInitialReceipt();
    }

    return () => {
      cancelled = true;
    };
  }, [receiptId]);

  async function processReceipt() {
    try {
      setProcessing(true);
      setError("");

      const response = await fetch(`/api/receipts/${receiptId}/process`, {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to process receipt");
      }

      await loadReceipt();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to process receipt",
      );
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-6xl text-sm text-slate-500">
          Loading receipt...
        </div>
      </main>
    );
  }

  if (error && !receipt) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <Link href="/" className="text-sm font-medium text-blue-600">
            ← Back to dashboard
          </Link>

          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-medium text-red-700">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  if (!receipt) {
    return null;
  }

  const pendingApproval =
    receipt.status === "REVIEW_REQUIRED"
      ? receipt.approvals.find((approval) => approval.status === "PENDING")
      : undefined;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Back to dashboard
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Header */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-medium text-blue-600">
                Receipt Details
              </p>

              <h1 className="mt-1 text-3xl font-bold">{receipt.vendor}</h1>

              <p className="mt-2 text-sm text-slate-500">
                Receipt ID: <span className="font-mono">{receipt.id}</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={receipt.status} />

              {receipt.status !== "COMPLETED" &&
                receipt.status !== "PROCESSING" && (
                  <button
                    onClick={processReceipt}
                    disabled={processing}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {processing ? "Processing..." : "Process receipt"}
                  </button>
                )}
            </div>
          </div>
        </section>

        {/* Receipt + classification */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Receipt Information">
            <InfoRow label="Vendor" value={receipt.vendor} />

            <InfoRow
              label="Receipt date"
              value={
                receipt.receiptDate
                  ? new Date(receipt.receiptDate).toLocaleDateString()
                  : "Not provided"
              }
            />

            <InfoRow
              label="Description"
              value={receipt.description ?? "Not provided"}
            />

            <InfoRow
              label="Subtotal"
              value={`$${Number(receipt.subtotal).toFixed(2)}`}
            />

            <InfoRow
              label="Tax"
              value={`$${Number(receipt.taxAmount).toFixed(2)}`}
            />

            <InfoRow
              label="Total"
              value={`$${Number(receipt.total).toFixed(2)}`}
            />

            <InfoRow
              label="GST/HST number"
              value={receipt.gstHstNumber ?? "Not provided"}
            />
          </Card>

          <Card title="Expense Classification">
            {receipt.expense ? (
              <>
                <InfoRow
                  label="Category"
                  value={receipt.expense.category ?? "Unclassified"}
                />

                <InfoRow
                  label="GIFI code"
                  value={receipt.expense.gifiCode ?? "Unresolved"}
                />

                <InfoRow
                  label="Confidence"
                  value={
                    receipt.expense.confidence !== null
                      ? `${(Number(receipt.expense.confidence) * 100).toFixed(
                          0,
                        )}%`
                      : "Not available"
                  }
                />

                <InfoRow
                  label="Classification status"
                  value={formatStatus(receipt.expense.classificationStatus)}
                />

                <InfoRow
                  label="Reason"
                  value={receipt.expense.reason ?? "No reason provided"}
                />
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Expense classification has not been generated yet.
              </p>
            )}
          </Card>
        </div>

        {/* Compliance */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="ITC Calculation">
            {receipt.expense ? (
              <>
                <InfoRow
                  label="Gross tax"
                  value={`$${Number(receipt.expense.grossTax ?? 0).toFixed(2)}`}
                />

                <InfoRow
                  label="Commercial use"
                  value={
                    receipt.expense.commercialUsePercentage !== null
                      ? `${Number(
                          receipt.expense.commercialUsePercentage,
                        ).toFixed(0)}%`
                      : "Not provided"
                  }
                />

                <InfoRow
                  label="Eligibility"
                  value={
                    receipt.expense.eligibilityPercentage !== null
                      ? `${(
                          Number(receipt.expense.eligibilityPercentage) * 100
                        ).toFixed(0)}%`
                      : "Not calculated"
                  }
                />

                <InfoRow
                  label="Eligible ITC"
                  value={`$${Number(receipt.expense.eligibleItc ?? 0).toFixed(
                    2,
                  )}`}
                />

                <InfoRow
                  label="ITC status"
                  value={formatStatus(receipt.expense.itcStatus ?? "REVIEW")}
                />
              </>
            ) : (
              <p className="text-sm text-slate-500">
                ITC calculation is not available yet.
              </p>
            )}
          </Card>

          <Card title="Approval">
            {pendingApproval ? (
              <>
                <InfoRow label="Status" value="Pending human review" />

                <InfoRow
                  label="Proposed category"
                  value={pendingApproval.proposedCategory ?? "Not provided"}
                />

                <InfoRow
                  label="Proposed GIFI"
                  value={pendingApproval.proposedGifiCode ?? "Not provided"}
                />

                <InfoRow
                  label="Proposed ITC"
                  value={`$${Number(pendingApproval.proposedItc ?? 0).toFixed(
                    2,
                  )}`}
                />

                <InfoRow
                  label="Reason"
                  value={pendingApproval.reason ?? "No reason provided"}
                />

                <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-4">
                  <p className="text-sm font-medium text-orange-800">
                    Human review is required before this receipt can be
                    completed.
                  </p>

                  <Link
                    href={`/approvals/${pendingApproval.id}`}
                    className="mt-3 inline-block rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                  >
                    Review approval
                  </Link>
                </div>
              </>
            ) : (
              <>
                <InfoRow label="Status" value="No pending approval" />

                {receipt.approvals.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">
                    No approval workflow has been created.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {receipt.approvals.slice(0, 3).map((approval) => (
                      <div
                        key={approval.id}
                        className="rounded-lg border border-slate-200 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {formatStatus(approval.status)}
                          </span>

                          <span className="text-xs text-slate-400">
                            {new Date(approval.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {approval.reviewer && (
                          <p className="mt-2 text-sm text-slate-500">
                            Reviewer: {approval.reviewer}
                          </p>
                        )}

                        {approval.decision && (
                          <p className="mt-1 text-sm text-slate-500">
                            Decision: {approval.decision}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        {/* Audit trail */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-semibold">Audit Trail</h2>
            <p className="mt-1 text-sm text-slate-500">
              Recorded processing and review events for this receipt.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {receipt.auditEvents.map((event) => (
              <div key={event.id} className="px-6 py-5">
                <div className="flex flex-col justify-between gap-2 md:flex-row">
                  <div>
                    <p className="font-medium">{formatStatus(event.action)}</p>

                    <p className="mt-1 text-sm text-slate-500">
                      Actor: {event.actor}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-xs text-slate-400">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>

                    <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">
                      {formatStatus(event.status)}
                    </span>
                  </div>
                </div>

                {(event.ruleVersion || event.model) && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {event.ruleVersion && (
                      <span className="rounded bg-slate-100 px-2 py-1">
                        Rule: {event.ruleVersion}
                      </span>
                    )}

                    {event.model && (
                      <span className="rounded bg-slate-100 px-2 py-1">
                        Model: {event.model}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {receipt.auditEvents.length === 0 && (
              <div className="px-6 py-8 text-sm text-slate-500">
                No audit events recorded.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <span className="text-sm text-slate-500">{label}</span>

      <span className="max-w-xl text-sm font-medium text-slate-900 sm:text-right">
        {value}
      </span>
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
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium ${styles[status]}`}
    >
      {formatStatus(status)}
    </span>
  );
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
