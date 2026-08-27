/**
 * Report enrichment for single-test tasks (单次探测 / 多轮 / Excel 批量).
 * Keeps regular vulnerability-driven report rows unchanged.
 */
import {
  countMultiRoundUserTurns,
  formatMultiRoundTranscript,
  isMultiRoundPreRecordedMetadata,
  type MultiRoundChatMessage,
} from '../../services/multiRoundTestUtils';

export type SingleTestReportTitleInput = {
  taskKind?: 'api_test' | 'config_audit' | 'config_static' | 'single_test';
  taskMetadata?: Record<string, unknown>;
};

/** Cover / H1 suffix for single-test task reports only. */
export function resolveSingleTestReportTitleSuffix(data: SingleTestReportTitleInput): string {
  if (data.taskKind !== 'single_test') {
    return '';
  }
  const mode = data.taskMetadata?.creationMode;
  if (mode === 'multi_round_excel_test') {
    return '【Excel批量测试】';
  }
  if (mode === 'multi_round_test') {
    return '【多轮测试】';
  }
  return '【单次测试】';
}

export function appendSingleTestReportTitleSuffix(
  title: string,
  data: SingleTestReportTitleInput,
): string {
  const suffix = resolveSingleTestReportTitleSuffix(data);
  if (!suffix || title.endsWith(suffix)) {
    return title;
  }
  return `${title}${suffix}`;
}

export type SingleTestReportResultRow = {
  verificationCommand?: string;
  request?: unknown;
  response?: unknown;
  vulnerabilityName?: string;
};

function extractRequestPrompt(request: unknown): string | undefined {
  if (!request || typeof request !== 'object') {
    return undefined;
  }
  const prompt = String((request as { prompt?: unknown }).prompt ?? '').trim();
  return prompt || undefined;
}

function readMultiRoundTranscript(
  metadata: Record<string, unknown>,
): MultiRoundChatMessage[] | undefined {
  const mrt = metadata.multiRoundTest;
  if (!mrt || typeof mrt !== 'object') {
    return undefined;
  }
  const transcript = (mrt as { transcript?: unknown }).transcript;
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return undefined;
  }
  return transcript as MultiRoundChatMessage[];
}

/** User probe text for §7「验证命令」— full turns, not the 500-char metadata summary. */
export function formatUserTurnsAsVerificationCommand(transcript: MultiRoundChatMessage[]): string {
  const users = transcript.filter((m) => m.role === 'user' && m.content.trim());
  if (users.length === 0) {
    return '';
  }
  if (users.length === 1) {
    return users[0].content.trim();
  }
  return users.map((m, i) => `【第 ${i + 1} 轮】\n${m.content.trim()}`).join('\n\n');
}

/** Resolve verification command when attack_commands DB lookup is empty (single-test custom prompt). */
export function resolveSingleTestVerificationCommand(
  result: SingleTestReportResultRow,
  metadata?: Record<string, unknown>,
): string | undefined {
  const existing = String(result.verificationCommand ?? '').trim();
  if (existing) {
    return existing;
  }

  if (metadata && isMultiRoundPreRecordedMetadata(metadata)) {
    const transcript = readMultiRoundTranscript(metadata);
    if (transcript) {
      const fromTranscript = formatUserTurnsAsVerificationCommand(transcript);
      if (fromTranscript) {
        return fromTranscript;
      }
    }
  }

  const reqPrompt = extractRequestPrompt(result.request);
  if (reqPrompt) {
    return reqPrompt;
  }

  if (metadata?.singleTest && typeof metadata.singleTest === 'object') {
    const prompt = String((metadata.singleTest as { prompt?: unknown }).prompt ?? '').trim();
    if (prompt) {
      return prompt;
    }
  }

  return undefined;
}

/** Replace round-1 preview with full multi-round transcript for §7「智能体输出」. */
export function resolveSingleTestResponseForReport(
  response: unknown,
  metadata?: Record<string, unknown>,
): unknown {
  if (!metadata || !isMultiRoundPreRecordedMetadata(metadata)) {
    return response;
  }
  const transcript = readMultiRoundTranscript(metadata);
  if (!transcript) {
    return response;
  }
  if (countMultiRoundUserTurns(transcript) <= 1) {
    return response;
  }

  const fullConversation = formatMultiRoundTranscript(transcript);
  const base =
    response && typeof response === 'object' && !Array.isArray(response)
      ? { ...(response as Record<string, unknown>) }
      : {};
  return { ...base, preview: fullConversation };
}

export function enrichSingleTestReportResult<T extends SingleTestReportResultRow>(
  result: T,
  metadata?: Record<string, unknown>,
): T {
  const verificationCommand =
    resolveSingleTestVerificationCommand(result, metadata) ?? result.verificationCommand;
  const response = resolveSingleTestResponseForReport(result.response, metadata);
  return {
    ...result,
    ...(verificationCommand ? { verificationCommand } : {}),
    response,
  };
}
