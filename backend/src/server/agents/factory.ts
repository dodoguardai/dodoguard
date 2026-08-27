import {
  TargetAgentClient,
  TargetAgentClientContext,
  TargetAgentRecord,
  TargetAgentType,
} from './types';
import { DifyAgentClient } from './clients/DifyAgentClient';
import { CozeAgentClient } from './clients/CozeAgentClient';
import { N8nAgentClient } from './clients';
import { ApiAgentClient } from './clients/ApiAgentClient';
import { LangChainAgentClient } from './clients/LangChainAgentClient';
import { DefaultAgentClient } from './clients/DefaultAgentClient';
import { FastGptAgentClient } from './clients/FastGptAgentClient';
import { TencentAdpAgentClient } from './clients/TencentAdpAgentClient';

export function createTargetAgentClient(
  agent: TargetAgentRecord,
  context: TargetAgentClientContext,
): TargetAgentClient {
  const type = agent.type as TargetAgentType;

  switch (type) {
    case 'dify':
      return new DifyAgentClient(agent, context);
    case 'coze':
      return new CozeAgentClient(agent, context);
    case 'n8n':
      return new N8nAgentClient(agent, context);
    case 'fastgpt':
      return new FastGptAgentClient(agent, context);
    case 'tencent-adp':
      return new TencentAdpAgentClient(agent, context);
    case 'api':
      return new ApiAgentClient(agent, context);
    case 'api-stream':
      return new ApiAgentClient(agent, context);
    case 'langchain':
      return new LangChainAgentClient(agent, context);
    case 'custom':
    case 'other':
    default:
      return new DefaultAgentClient(agent, context);
  }
}
