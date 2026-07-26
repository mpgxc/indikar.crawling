import type { APIGatewayProxyEventV2 } from "aws-lambda";

export function validateApiKey(
  event: APIGatewayProxyEventV2,
  expectedKey: string
): boolean {
  const provided =
    event.headers["x-api-key"] ?? event.headers["X-Api-Key"] ?? "";
  return provided === expectedKey && expectedKey.length > 0;
}
