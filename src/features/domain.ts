export type TaskStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED";

export interface TaskResult {
  summary: string;
  facts: string[];
}

export interface Task {
  taskId: string;
  name: string;
  webhookUrl: string;
  status: TaskStatus;
  result?: TaskResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateTaskInput = Pick<Task, "taskId" | "name" | "webhookUrl">;

export type UpdateTaskInput = Partial<
  Pick<Task, "status" | "result" | "error" | "updatedAt">
>;
