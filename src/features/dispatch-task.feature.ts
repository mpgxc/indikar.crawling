import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { randomUUID } from "crypto";
import type { TaskVault } from "../adapters/vault/vault";
import { logger } from "../shared/logger";

export interface DispatchTaskInput {
  name: string;
  webhookUrl: string;
}

export interface DispatchTaskOutput {
  taskId: string;
}

export class DispatchTask {
  constructor(
    private readonly vault: TaskVault,
    private readonly sqsClient: SQSClient,
    private readonly queueUrl: string
  ) {}

  async execute(input: DispatchTaskInput): Promise<DispatchTaskOutput> {
    const taskId = randomUUID();

    await this.vault.create({
      taskId,
      name: input.name,
      webhookUrl: input.webhookUrl,
    });

    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({
          taskId,
          name: input.name,
          webhookUrl: input.webhookUrl,
        }),
        MessageAttributes: {
          taskId: { DataType: "String", StringValue: taskId },
        },
      })
    );

    logger.info({ taskId, name: input.name }, "Task dispatched");

    return { taskId };
  }
}
