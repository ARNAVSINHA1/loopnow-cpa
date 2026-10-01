/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Approval = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EDITED";
  proposedCategory: string | null;
  proposedGifiCode: string | null;
  proposedMealException: string | null;
  proposedItc: string | number | null;
  reason: string | null;
  reviewer: string | null;
  decision: string | null;
  reviewedAt: string | null;
  receipt: {
    id: string;
    vendor: string;
    subtotal: string | number;
    taxAmount: string | number;
    total: string | number;
    gstHstNumber: string | null;
    status: string;
    expense: {
      category: string | null;
      gifiCode: string | null;
      eligibleItc: string | number | null;
      confidence: string | number | null;
      reason: string | null;
    } | null;
  };
};

function money(value: string | number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export default function ApprovalPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const approvalId = params.id;

  const [approval, setApproval] = useState<Approval | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [reviewerToken, setReviewerToken] = useState("");
  const [category, setCategory] = useState("");
  const [gifiCode, setGifiCode] = useState("");
  const [mealException, setMealException] = useState("standard");
  const [decision, setDecision] = useState("");

  useEffect(() => {
    async function loadApproval() {
      try {
        setLoading(true);

        const response = await fetch(`/api/approvals/${approvalId}`);

        if (!response.ok) {
          throw new Error("Unable to load approval");
        }

        const json = await response.json();
        const data = json.data as Approval;

        setApproval(data);
        setCategory(data.proposedCategory ?? "");
        setGifiCode(data.proposedGifiCode ?? "");
        setMealException(data.proposedMealException ?? "standard");
        setDecision(data.decision ?? "");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load approval",
        );
      } finally {
        setLoading(false);
      }
    }

    if (approvalId) {
      loadApproval();
    }
  }, [approvalId]);

  async function submit(action: "APPROVE" | "EDIT" | "REJECT") {
    if (!approval) return;
    if (!reviewerToken) {
      setError("Reviewer access token is required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/approvals/${approval.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${reviewerToken}`,
        },
        body: JSON.stringify({
          action,
          category: category || undefined,
          gifiCode: gifiCode || undefined,
          mealException:
            category === "Meals and Entertainment" ? mealException : undefined,
          decision:
            decision ||
            (action === "APPROVE"
              ? "Approved after manual review"
              : action === "EDIT"
                ? "Classification edited and approved by reviewer."
                : "Rejected after manual review"),
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Unable to process approval");
      }

      router.push(`/receipts/${approval.receipt.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to process approval",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-slate-600">Loading approval...</p>
        </div>
      </main>
    );
  }

  if (error || !approval) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            {error || "Approval not found"}
          </div>
        </div>
      </main>
    );
  }

  const receipt = approval.receipt;
  const expense = receipt.expense;

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href={`/receipts/${receipt.id}`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          ← Back to receipt
        </Link>

        <div className="mt-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Human Review</p>

              <h1 className="text-3xl font-bold text-slate-900">
                {receipt.vendor}
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Approval ID: {approval.id}
              </p>
            </div>

            <span className="inline-flex w-fit rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              {approval.status}
            </span>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {/* Receipt summary */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Receipt Summary
            </h2>

            <div className="mt-5 space-y-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">{money(receipt.subtotal)}</span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Tax</span>
                <span className="font-medium">{money(receipt.taxAmount)}</span>
              </div>

              <div className="flex justify-between gap-4 border-t border-slate-100 pt-4">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="font-semibold text-slate-900">
                  {money(receipt.total)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">GST/HST number</span>
                <span className="font-medium">
                  {receipt.gstHstNumber ?? "Not provided"}
                </span>
              </div>
            </div>
          </section>

          {/* Why review */}
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-900">
              Why this needs review
            </h2>

            <p className="mt-4 text-sm leading-6 text-amber-800">
              {approval.reason ??
                expense?.reason ??
                "The automated processing workflow requires human review."}
            </p>
          </section>
        </div>

        {/* Proposed classification */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Proposed Classification
          </h2>

          <div className="mt-5 grid gap-6 md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">Category</p>
              <p className="mt-1 font-semibold text-slate-900">
                {approval.proposedCategory ?? "Not classified"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">GIFI code</p>
              <p className="mt-1 font-semibold text-slate-900">
                {approval.proposedGifiCode ?? "Not mapped"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Proposed ITC</p>
              <p className="mt-1 font-semibold text-slate-900">
                {money(approval.proposedItc)}
              </p>
            </div>
          </div>

          {expense?.confidence !== null &&
            expense?.confidence !== undefined && (
              <p className="mt-5 text-sm text-slate-500">
                Classification confidence:{" "}
                <span className="font-semibold text-slate-700">
                  {(Number(expense.confidence) * 100).toFixed(0)}%
                </span>
              </p>
            )}
        </section>

        {/* Review form */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Reviewer Decision
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Reviewer access token
              </span>

              <input
                type="password"
                autoComplete="off"
                value={reviewerToken}
                onChange={(event) => setReviewerToken(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Configured reviewer token"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Category
              </span>

              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Expense category"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                GIFI Code
              </span>

              <input
                value={gifiCode}
                onChange={(event) => setGifiCode(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="e.g. 8810"
              />
            </label>

            {category === "Meals and Entertainment" && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Meal exception
                </span>
                <select
                  value={mealException}
                  onChange={(event) => setMealException(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="standard">Standard (50%)</option>
                  <option value="charityOrPublicInstitution">
                    Charity or public institution (100%)
                  </option>
                  <option value="longHaulTruckDriver">
                    Long-haul truck driver (80%)
                  </option>
                </select>
              </label>
            )}
          </div>

          <p className="mt-4 text-sm text-slate-500">
            Eligible ITC is recalculated from persisted receipt values when you
            submit the decision.
          </p>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-slate-700">
              Decision / Reason
            </span>

            <textarea
              value={decision}
              onChange={(event) => setDecision(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Explain the review decision..."
            />
          </label>

          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit("APPROVE")}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Approve"}
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => submit("EDIT")}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit & Approve
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => submit("REJECT")}
              className="rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
