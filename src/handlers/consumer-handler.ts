import type { SQSBatchResponse, SQSEvent } from "aws-lambda";

import { logger } from "../shared/logger";
import { container } from "./container";

interface SQSMessageBody {
  taskId: string;
  name: string;
  webhookUrl: string;
}

export const handler = async (
  event: SQSEvent
): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];

  for (const record of event.Records) {
    const recordLogger = logger.child({ messageId: record.messageId });

    let body: SQSMessageBody;

    try {
      body = JSON.parse(record.body) as SQSMessageBody;
    } catch (err) {
      recordLogger.error({ err }, "Failed to parse SQS message");
      batchItemFailures.push({ itemIdentifier: record.messageId });
      continue;
    }

    try {
      await container.processTask.execute(body);
    } catch (err) {
      recordLogger.error({ err, taskId: body.taskId }, "Task processing failed");
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
