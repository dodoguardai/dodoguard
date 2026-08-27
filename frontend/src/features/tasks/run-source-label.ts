/** Task/report metadata.runSource → display label */
export function getRunSourceLabel(
  metadata: Record<string, unknown> | undefined | null,
  isZh: boolean,
): string | null {
  const src = metadata?.runSource;
  if (src === 'single') {
    const mode = metadata?.creationMode;
    if (mode === 'multi_round_test') {
      return isZh ? '多轮' : 'Multi-round';
    }
    if (mode === 'multi_round_excel_test') {
      return isZh ? 'Excel多轮' : 'Excel multi-round';
    }
    return isZh ? '单次' : 'Single';
  }
  if (src === 'commercial_api') {
    return isZh ? '商业API' : 'Commercial API';
  }
  return null;
}

export function isMultiRoundTestTask(metadata: Record<string, unknown> | undefined | null): boolean {
  const mode = metadata?.creationMode;
  return mode === 'multi_round_test' || mode === 'multi_round_excel_test';
}

export function getMultiRoundTestRoundCount(
  metadata: Record<string, unknown> | undefined | null,
): number | undefined {
  const mrt = metadata?.multiRoundTest as { roundCount?: unknown } | undefined;
  return typeof mrt?.roundCount === 'number' ? mrt.roundCount : undefined;
}

export function isSingleTestTask(metadata: Record<string, unknown> | undefined | null): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }
  const mode = metadata.creationMode;
  if (mode === 'multi_round_test' || mode === 'multi_round_excel_test' || mode === 'single_test') {
    return true;
  }
  return metadata.runSource === 'single' || metadata.taskKind === 'single_test';
}

export function isCommercialApiTestTask(
  metadata: Record<string, unknown> | undefined | null,
): boolean {
  return metadata?.runSource === 'commercial_api' || metadata?.taskKind === 'commercial_api_test';
}

/** User-entered probe text for single-test tasks (`metadata.singleTest.prompt`). */
export function getSingleTestPrompt(
  metadata: Record<string, unknown> | undefined | null,
): string | null {
  if (!isSingleTestTask(metadata)) {
    return null;
  }
  const st = metadata?.singleTest;
  if (!st || typeof st !== 'object') {
    return null;
  }
  const prompt = String((st as { prompt?: unknown }).prompt ?? '').trim();
  return prompt || null;
}

/** Expected attack-success behavior for single-test (`metadata.singleTest.expectedSuccess`). */
export function getSingleTestExpectedSuccess(
  metadata: Record<string, unknown> | undefined | null,
): string | null {
  if (!isSingleTestTask(metadata)) {
    return null;
  }
  const st = metadata?.singleTest;
  if (!st || typeof st !== 'object') {
    return null;
  }
  const expected = String((st as { expectedSuccess?: unknown }).expectedSuccess ?? '').trim();
  return expected || null;
}
