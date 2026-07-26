import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockExecute = vi.fn();
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { ProcessTask } from "./process-task.feature";
import type { TaskVault } from "../adapters/vault/vault";
import type { ResearchProfile } from "./research-profile.feature";

const mockVault = {
  update: mockUpdate,
} as never as TaskVault;

const mockResearchProfile = {
  execute: mockExecute,
} as never as ResearchProfile;

const SUCCESS_RESULT = {
  summary: "Experienced engineer.",
  facts: ["Speaks 3 languages", "Open source contributor"],
};

const makeFeature = () =>
  new ProcessTask(mockVault, mockResearchProfile);

const INPUT = {
  taskId: "task-123",
  name: "John Doe",
  webhookUrl: "https://webhook.example.com/callback",
};

describe("ProcessTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
    mockExecute.mockResolvedValue(SUCCESS_RESULT);
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
  });

  it("updates to PROCESSING, runs research, updates to DONE, posts webhook", async () => {
    const feature = makeFeature();
    await feature.execute(INPUT);

    expect(mockUpdate).toHaveBeenCalledWith("task-123", {
      status: "PROCESSING",
    });
    expect(mockExecute).toHaveBeenCalledWith({ name: "John Doe" });
    expect(mockUpdate).toHaveBeenCalledWith("task-123", {
      status: "DONE",
      result: SUCCESS_RESULT,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("marks task as FAILED when research throws", async () => {
    mockExecute.mockRejectedValueOnce(new Error("LLM timeout"));

    const feature = makeFeature();
    await expect(feature.execute(INPUT)).rejects.toThrow("LLM timeout");

    expect(mockUpdate).toHaveBeenCalledWith(
      "task-123",
      expect.objectContaining({ status: "FAILED", error: "LLM timeout" })
    );
  });

  it("marks task as FAILED when webhook delivery fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const feature = makeFeature();
    await expect(feature.execute(INPUT)).rejects.toThrow(
      "Webhook delivery failed: 500"
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      "task-123",
      expect.objectContaining({ status: "FAILED" })
    );
  });

  it("does not throw when FAILED status update itself fails", async () => {
    mockExecute.mockRejectedValueOnce(new Error("use case error"));
    mockUpdate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Redis also down"));

    const feature = makeFeature();

    await expect(feature.execute(INPUT)).rejects.toThrow("use case error");
  });
});
