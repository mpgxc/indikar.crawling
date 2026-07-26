import { SQSClient } from "@aws-sdk/client-sqs";

import { ProxycurlAdapter } from "../adapters/linkedin/proxycurl.adapter";
import { createSearchAdapter } from "../adapters/search/search.module";
import { config } from "../shared/config";
import { TaskVault } from "../adapters/vault/vault";
import { ResearchProfile } from "../features/research-profile.feature";
import { DispatchTask } from "../features/dispatch-task.feature";
import { ProcessTask } from "../features/process-task.feature";

function buildContainer() {
  const searchAdapter = createSearchAdapter(config);
  const proxycurlAdapter = new ProxycurlAdapter(config.PROXYCURL_API_KEY);
  const vault = TaskVault.create(
    config.UPSTASH_REDIS_REST_URL,
    config.UPSTASH_REDIS_REST_TOKEN
  );

  const researchProfile = new ResearchProfile({
    searchAdapter,
    proxycurlAdapter,
    model: config.LLM_MODEL,
    openaiApiKey: config.OPENAI_API_KEY,
  });

  const sqsClient = new SQSClient({});

  const dispatchTask = new DispatchTask(
    vault,
    sqsClient,
    config.SQS_QUEUE_URL
  );

  const processTask = new ProcessTask(
    vault,
    researchProfile
  );

  return {
    researchProfile,
    vault,
    dispatchTask,
    processTask,
  };
}

export const container = buildContainer();
