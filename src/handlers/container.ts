import { SQSClient } from "@aws-sdk/client-sqs";

import { ProxycurlAdapter } from "../adapters/linkedin/proxycurl.adapter";
import { createSearchAdapter } from "../adapters/search/search.factory";
import { config } from "../shared/config";
import { TaskStore } from "../adapters/store/task-store";
import { ResearchProfile } from "../features/research-profile.feature";
import { DispatchTask } from "../features/dispatch-task.feature";
import { ProcessTask } from "../features/process-task.feature";

function buildContainer() {
  const searchAdapter = createSearchAdapter(config);
  const proxycurlAdapter = new ProxycurlAdapter(config.PROXYCURL_API_KEY);
  const taskStore = TaskStore.create(
    config.UPSTASH_REDIS_REST_URL,
    config.UPSTASH_REDIS_REST_TOKEN
  );

  const researchProfile = new ResearchProfile(
    searchAdapter,
    proxycurlAdapter,
    config.LLM_MODEL,
    config.OPENAI_API_KEY
  );

  const sqsClient = new SQSClient({});

  const dispatchTask = new DispatchTask(
    taskStore,
    sqsClient,
    config.SQS_QUEUE_URL
  );

  const processTask = new ProcessTask(
    taskStore,
    researchProfile
  );

  return {
    researchProfile,
    taskStore,
    dispatchTask,
    processTask,
  };
}

export const container = buildContainer();
