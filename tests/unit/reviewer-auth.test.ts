/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { afterEach, describe, expect, it } from "vitest";
import { authorizeReviewer } from "@/server/approvals/reviewer-auth";

describe("reviewer authorization", () => {
  afterEach(() => {
    delete process.env.APPROVAL_REVIEWER_ID;
    delete process.env.APPROVAL_REVIEWER_TOKEN;
  });

  it("fails closed when reviewer configuration is absent", () => {
    const result = authorizeReviewer(
      new Request("http://localhost", {
        headers: { authorization: "Bearer any-token" },
      }),
    );

    expect(result).toEqual({ status: "NOT_CONFIGURED" });
  });

  it("rejects a missing or incorrect bearer token", () => {
    process.env.APPROVAL_REVIEWER_ID = "assessment-reviewer";
    process.env.APPROVAL_REVIEWER_TOKEN = "test-secret-token";

    const result = authorizeReviewer(
      new Request("http://localhost", {
        headers: { authorization: "Bearer wrong-token" },
      }),
    );

    expect(result).toEqual({ status: "UNAUTHORIZED" });
  });

  it("maps a valid token to the server-configured identity", () => {
    process.env.APPROVAL_REVIEWER_ID = "assessment-reviewer";
    process.env.APPROVAL_REVIEWER_TOKEN = "test-secret-token";

    const result = authorizeReviewer(
      new Request("http://localhost", {
        headers: { authorization: "Bearer test-secret-token" },
      }),
    );

    expect(result).toEqual({
      status: "AUTHORIZED",
      reviewerId: "assessment-reviewer",
    });
  });
});
