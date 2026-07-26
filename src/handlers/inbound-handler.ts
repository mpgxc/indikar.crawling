import type {
    APIGatewayProxyEventV2,
    APIGatewayProxyResultV2,
} from "aws-lambda";
import { z } from "zod";

import { validateApiKey } from "../shared/auth";
import { config } from "../shared/config";
import { logger } from "../shared/logger";
import { container } from "./container";

const requestSchema = z.object({
  name: z.string().min(1, "name is required"),
  webhookUrl: z.string().url("webhookUrl must be a valid URL"),
});

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const requestLogger = logger.child({
    requestId: event.requestContext.requestId,
    path: event.rawPath,
    method: event.requestContext.http.method,
  });

  if (!validateApiKey(event, config.API_KEY)) {
    requestLogger.warn("Unauthorized request");
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    const body = JSON.parse(event.body ?? "{}") as unknown;
    parsed = requestSchema.parse(body);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => i.message).join(", ")
        : "Invalid JSON body";
    requestLogger.warn({ err }, "Bad request");
    return jsonResponse(400, { error: message });
  }

  try {
    const { taskId } = await container.dispatchTask.execute(parsed);
    requestLogger.info({ taskId, name: parsed.name }, "Task dispatched");
    return jsonResponse(202, {
      taskId,
      status: "PENDING",
      message: "Task accepted. Result will be posted to webhookUrl.",
    });
  } catch (err) {
    requestLogger.error({ err }, "Failed to dispatch task");
    return jsonResponse(500, { error: "Failed to dispatch task" });
  }
};
