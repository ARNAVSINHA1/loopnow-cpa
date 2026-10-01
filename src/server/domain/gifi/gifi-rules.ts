/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

export type GifiCandidate = {
  code: string;
  description: string;
  category: string;
  parentCategory: string;
  applicableExpenseTypes: string[];
  confidence: number;
  source: string;
};

const GIFI_CATALOGUE: GifiCandidate[] = [
  {
    code: "8810",
    description: "Office expenses",
    category: "Office Expenses",
    parentCategory: "Business Expenses",
    applicableExpenseTypes: ["office_supplies", "office_expenses"],
    confidence: 1,
    source: "assessment_prototype_catalogue",
  },
  {
    code: "8523",
    description: "Meals and entertainment",
    category: "Meals and Entertainment",
    parentCategory: "Business Expenses",
    applicableExpenseTypes: ["business_meal", "meals_entertainment"],
    confidence: 1,
    source: "assessment_example",
  },
];

export function findGifiCode(code: string): GifiCandidate | null {
  return GIFI_CATALOGUE.find((item) => item.code === code) ?? null;
}

export function findGifiForCategory(category: string): GifiCandidate | null {
  const normalized = category.trim().toLowerCase();

  return (
    GIFI_CATALOGUE.find((item) => item.category.toLowerCase() === normalized) ??
    null
  );
}
