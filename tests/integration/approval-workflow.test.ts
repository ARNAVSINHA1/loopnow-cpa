import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  approval: { findUnique: vi.fn() },
  auditEvent: { create: vi.fn() },
}));

vi.mock("@/server/db", () => ({ prisma: prismaMock }));

import { POST } from "../../app/api/approvals/[id]/route";

const approvalId = "approval-integration-1";

function createTransaction(
  overrides: {
    approvalStatus?: string;
    receiptStatus?: string;
    category?: string | null;
    gifiCode?: string | null;
    proposedMealException?: string | null;
    commercialUse?: number | null;
  } = {},
) {
  const approval = {
    id: approvalId,
    receiptId: "receipt-integration-1",
    agentRunId: "run-integration-1",
    status: overrides.approvalStatus ?? "PENDING",
    proposedCategory: overrides.category ?? "Office Expenses",
    proposedGifiCode: overrides.gifiCode ?? "8810",
    proposedMealException: overrides.proposedMealException ?? null,
    proposedItc: 1,
    receipt: {
      id: "receipt-integration-1",
      status: overrides.receiptStatus ?? "REVIEW_REQUIRED",
      category: "Office Expenses",
      taxAmount: 12,
      total: 100,
      gstHstNumber: "123456789RT0001",
      commercialUsePercentage: 100,
    },
  };

  const tx = {
    approval: {
      findUnique: vi.fn().mockResolvedValue(approval),
      update: vi.fn().mockImplementation(async ({ data }) => ({
        ...approval,
        ...data,
      })),
    },
    expense: {
      findUnique: vi.fn().mockResolvedValue({
        commercialUsePercentage: overrides.commercialUse ?? 100,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    receipt: { update: vi.fn().mockResolvedValue({}) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };

  prismaMock.$transaction.mockImplementation(async (callback) => callback(tx));
  prismaMock.approval.findUnique.mockResolvedValue({
    receiptId: approval.receiptId,
    agentRunId: approval.agentRunId,
  });

  return { approval, tx };
}

async function postApproval(
  body: Record<string, unknown>,
  options: { token?: string; auth?: boolean } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });

  if (options.auth !== false) {
    headers.set(
      "authorization",
      `Bearer ${options.token ?? "reviewer-secret-for-tests"}`,
    );
  }

  return POST(
    new Request(`http://localhost/api/approvals/${approvalId}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: approvalId }) },
  );
}

describe("approval API workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APPROVAL_REVIEWER_ID = "configured-reviewer";
    process.env.APPROVAL_REVIEWER_TOKEN = "reviewer-secret-for-tests";
    prismaMock.auditEvent.create.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.APPROVAL_REVIEWER_ID;
    delete process.env.APPROVAL_REVIEWER_TOKEN;
  });

  it("approves using recalculated ITC rather than the submitted value", async () => {
    const { tx } = createTransaction();
    const response = await postApproval({ action: "APPROVE", itc: 1 });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.status).toBe("APPROVED");
    expect(result.data.eligibleItc).toBe(12);
    expect(tx.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eligibleItc: 12 }),
      }),
    );
  });

  it("rejects the pending approval and retains the review gate", async () => {
    const { tx } = createTransaction();
    const response = await postApproval({ action: "REJECT" });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.status).toBe("REJECTED");
    expect(tx.receipt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REVIEW_REQUIRED" } }),
    );
  });

  it("edits category and GIFI while recomputing ITC server-side", async () => {
    const { tx } = createTransaction();
    const response = await postApproval({
      action: "EDIT",
      category: "Meals and Entertainment",
      gifiCode: "8523",
      itc: 1,
    });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.status).toBe("EDITED");
    expect(result.data.eligibleItc).toBe(6);
    expect(tx.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "Meals and Entertainment",
          gifiCode: "8523",
          eligibleItc: 6,
        }),
      }),
    );
  });

  it("accepts a proposed charity meal exception only through authorized review", async () => {
    const { tx } = createTransaction({
      category: "Meals and Entertainment",
      gifiCode: "8523",
      proposedMealException: "charityOrPublicInstitution",
    });
    const response = await postApproval({
      action: "APPROVE",
      mealException: "charityOrPublicInstitution",
    });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.eligibleItc).toBe(12);
    expect(tx.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mealException: "charityOrPublicInstitution",
          eligibleItc: 12,
        }),
      }),
    );
  });

  it("requires explicit reviewer confirmation for unsupported meal proposals", async () => {
    createTransaction({
      category: "Meals and Entertainment",
      gifiCode: "8523",
      proposedMealException: "claimEverything",
    });
    const response = await postApproval({ action: "APPROVE" });

    expect(response.status).toBe(422);
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "APPROVAL_MUTATION_FAILED",
          status: "FAILURE",
        }),
      }),
    );
  });

  it.each([
    ["duplicate action", { approvalStatus: "APPROVED" }, "APPROVE"],
    ["already rejected approval", { approvalStatus: "REJECTED" }, "APPROVE"],
    ["already completed receipt", { receiptStatus: "COMPLETED" }, "APPROVE"],
    ["review bypass attempt", { receiptStatus: "PENDING" }, "APPROVE"],
  ])("rejects %s", async (_caseName, overrides, action) => {
    createTransaction(overrides as Parameters<typeof createTransaction>[0]);
    const response = await postApproval({ action });

    expect(response.status).toBe(409);
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "APPROVAL_MUTATION_FAILED",
          status: "FAILURE",
          ruleVersion: "CRA-PROTOTYPE-v1",
          receiptId: "receipt-integration-1",
          actor: "configured-reviewer",
          metadata: expect.objectContaining({
            approvalId,
            attemptedAction: action,
            reason: expect.any(String),
          }),
        }),
      }),
    );
  });

  it.each([
    [
      "invalid category",
      { action: "EDIT", category: "Miscellaneous", gifiCode: "8810" },
      undefined,
    ],
    [
      "invalid GIFI",
      { action: "EDIT", category: "Office Expenses", gifiCode: "9999" },
      undefined,
    ],
    [
      "ITC above deterministic maximum",
      {
        action: "EDIT",
        category: "Office Expenses",
        gifiCode: "8810",
        itc: 500,
      },
      undefined,
    ],
    [
      "invalid commercial-use percentage",
      { action: "EDIT", category: "Office Expenses", gifiCode: "8810" },
      { commercialUse: 101 },
    ],
  ])("rejects %s", async (_caseName, body, overrides) => {
    createTransaction(overrides as Parameters<typeof createTransaction>[0]);
    const response = await postApproval(body as Record<string, unknown>);

    expect(response.status).toBe(422);
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "APPROVAL_MUTATION_FAILED",
          status: "FAILURE",
        }),
      }),
    );
  });

  it("rejects negative ITC input before mutation and audits it", async () => {
    createTransaction();
    const response = await postApproval({ action: "EDIT", itc: -1 });

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.auditEvent.create).toHaveBeenCalled();
  });

  it("rejects unauthorized reviewers and never trusts body identity", async () => {
    createTransaction();
    const response = await postApproval(
      { action: "APPROVE", reviewer: "administrator" },
      { auth: false },
    );

    expect(response.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actor: "unauthenticated" }),
      }),
    );
  });

  it("records the configured identity and rejects a client-supplied reviewer field", async () => {
    createTransaction();
    const response = await postApproval({
      action: "APPROVE",
      reviewer: "attacker-controlled",
    });

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actor: "configured-reviewer" }),
      }),
    );
  });
});
