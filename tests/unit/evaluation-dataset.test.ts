/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import { describe, expect, it } from "vitest";
import {
  dataset,
  runEvaluationCase,
} from "@/server/evaluation/receipt-evaluation";

describe("evaluation dataset", () => {
  it("contains at least 60 cases", () => {
    expect(dataset.length).toBeGreaterThanOrEqual(60);
  });

  it("executes every case and matches its deterministic expectation", () => {
    for (const caseDefinition of dataset) {
      expect(
        runEvaluationCase(caseDefinition.input),
        caseDefinition.name,
      ).toEqual(caseDefinition.expected);
    }
  });
});
