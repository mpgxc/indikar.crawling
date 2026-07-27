import { Redis } from "@upstash/redis";
import type { Task, CreateTaskInput, UpdateTaskInput } from "../../features/domain";
import { logger } from "../../shared/logger";

const TASK_TTL_SECONDS = 86_400;
const KEY_PREFIX = "ice-breaker:task";

export class TaskStore {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  static create(restUrl: string, restToken: string): TaskStore {
    const redis = new Redis({ url: restUrl, token: restToken });
    return new TaskStore(redis);
  }

  private key(taskId: string): string {
    return `${KEY_PREFIX}:${taskId}`;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString();

    const task: Task = {
      taskId: input.taskId,
      name: input.name,
      webhookUrl: input.webhookUrl,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };

    await this.redis.set(this.key(task.taskId), JSON.stringify(task), {
      ex: TASK_TTL_SECONDS,
    });

    logger.info({ taskId: task.taskId, status: task.status }, "Task created");

    return task;
  }

  async update(taskId: string, update: UpdateTaskInput): Promise<Task> {
    const existing = await this.get(taskId);

    if (!existing) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updated: Task = {
      ...existing,
      ...update,
      updatedAt: update.updatedAt ?? new Date().toISOString(),
    };

    await this.redis.set(this.key(taskId), JSON.stringify(updated), {
      ex: TASK_TTL_SECONDS,
    });

    logger.info({ taskId, status: updated.status }, "Task updated");

    return updated;
  }

  async get(taskId: string): Promise<Task | null> {
    const raw = await this.redis.get<string>(this.key(taskId));

    if (!raw) return null;

    const data: Task =
      typeof raw === "string" ? (JSON.parse(raw) as Task) : raw;

    return data;
  }
}
