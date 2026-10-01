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
    source: "prototype_catalogue",
  },
];

export function findGifiCode(code: string): GifiCandidate | null {
  return GIFI_CATALOGUE.find((item) => item.code === code) ?? null;
}

export function findGifiForCategory(
  category: string,
): GifiCandidate | null {
  const normalized = category.trim().toLowerCase();

  return (
    GIFI_CATALOGUE.find(
      (item) => item.category.toLowerCase() === normalized,
    ) ?? null
  );
}