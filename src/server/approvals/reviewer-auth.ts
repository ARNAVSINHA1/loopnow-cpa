import { timingSafeEqual } from "node:crypto";

export type ReviewerAuthorization =
  | { status: "AUTHORIZED"; reviewerId: string }
  | { status: "UNAUTHORIZED" | "NOT_CONFIGURED" };

export function authorizeReviewer(request: Request): ReviewerAuthorization {
  const reviewerId = process.env.APPROVAL_REVIEWER_ID?.trim();
  const configuredToken = process.env.APPROVAL_REVIEWER_TOKEN;

  if (!reviewerId || !configuredToken) {
    return { status: "NOT_CONFIGURED" };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const providedToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const expected = Buffer.from(configuredToken);
  const provided = Buffer.from(providedToken);

  if (
    expected.length === 0 ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return { status: "UNAUTHORIZED" };
  }

  return { status: "AUTHORIZED", reviewerId };
}
