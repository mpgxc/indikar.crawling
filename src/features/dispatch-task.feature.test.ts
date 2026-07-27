import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockSend = vi.fn();
const mockSqsClient = { send: mockSend } as never;

vi.mock("crypto", () => ({
  randomUUID: vi.fn(() => "uuid-task-123"),
}));

import type { TaskStore } from "../adapters/store/task-store";
import { DispatchTask } from "./dispatch-task.feature";

const mockTaskStore = {
  create: mockCreate,
} as never as TaskStore;

const makeFeature = () =>
  new DispatchTask(mockTaskStore, mockSqsClient, "https://sqs.queue.url");

describe("DispatchTask", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a task in Redis and sends to SQS", async () => {
    mockCreate.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const feature = makeFeature();
    const result = await feature.execute({
      name: "John Doe",
      webhookUrl: "https://webhook.example.com",
    });

    expect(result.taskId).toBe("uuid-task-123");
    expect(mockCreate).toHaveBeenCalledWith({
      taskId: "uuid-task-123",
      name: "John Doe",
      webhookUrl: "https://webhook.example.com",
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("throws when Redis fails", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Redis down"));

    const feature = makeFeature();
    await expect(
      feature.execute({ name: "John", webhookUrl: "https://webhook.example.com" })
    ).rejects.toThrow("Redis down");
  });

  it("throws when SQS fails", async () => {
    mockCreate.mockResolvedValueOnce({});
    mockSend.mockRejectedValueOnce(new Error("SQS unavailable"));

    const feature = makeFeature();
    await expect(
      feature.execute({ name: "John", webhookUrl: "https://webhook.example.com" })
    ).rejects.toThrow("SQS unavailable");
  });
});
