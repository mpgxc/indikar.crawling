import type { TaskStore } from "../adapters/store/task-store";
import type { ResearchProfile } from "./research-profile.feature";
import { logger } from "../shared/logger";

export interface ProcessTaskInput {
  taskId: string;
  name: string;
  webhookUrl: string;
}

export class ProcessTask {
  constructor(
    private readonly taskStore: TaskStore,
    private readonly researchProfile: ResearchProfile
  ) {}

  async execute(input: ProcessTaskInput): Promise<void> {
    const { taskId, name, webhookUrl } = input;
    const recordLogger = logger.child({ taskId, name });

    recordLogger.info("Processing task");

    await this.taskStore.update(taskId, { status: "PROCESSING" });

    try {
      const result = await this.researchProfile.execute({ name });

      await this.taskStore.update(taskId, {
        status: "DONE",
        result,
      });

      recordLogger.info("Processing complete, delivering webhook");

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status: "DONE", result }),
      });

      if (!response.ok) {
        throw new Error(
          `Webhook delivery failed: ${response.status} ${response.statusText}`
        );
      }

      recordLogger.info("Webhook delivered successfully");
    } catch (err) {
      await this.taskStore
        .update(taskId, {
          status: "FAILED",
          error: err instanceof Error ? err.message : "Unknown error",
        })
        .catch((updateErr: unknown) =>
          recordLogger.error(
            { err: updateErr },
            "Failed to update task status to FAILED"
          )
        );
      throw err;
    }
  }
}
