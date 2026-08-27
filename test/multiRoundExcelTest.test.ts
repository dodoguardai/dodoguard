import {
  MULTI_ROUND_EXCEL_MAX_INSTRUCTIONS,
  parseMultiRoundExcelFromRows,
  parseMultiRoundInstructionsFromRows,
} from '../backend/src/services/multiRoundExcelTest';

describe('parseMultiRoundInstructionsFromRows', () => {
  it('parses header row with 轮次 and 测试指令', () => {
    const rows = [
      ['轮次', '测试指令'],
      ['1', '第一条指令'],
      ['2', '第二条指令'],
    ];
    const result = parseMultiRoundInstructionsFromRows(rows);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ round: 1, content: '第一条指令' });
    expect(result[1]).toEqual({ round: 2, content: '第二条指令' });
  });

  it('skips empty instruction rows', () => {
    const rows = [
      ['轮次', '测试指令'],
      ['1', '有效指令'],
      ['2', ''],
      ['', '  '],
    ];
    expect(parseMultiRoundInstructionsFromRows(rows)).toHaveLength(1);
  });

  it('supports single-column layout without header', () => {
    const rows = [['指令一'], ['指令二']];
    const result = parseMultiRoundInstructionsFromRows(rows);
    expect(result).toEqual([
      { round: undefined, content: '指令一' },
      { round: undefined, content: '指令二' },
    ]);
  });

  it('throws when no instructions found', () => {
    expect(() => parseMultiRoundInstructionsFromRows([['轮次', '测试指令']])).toThrow(/未找到有效/);
  });

  it('throws when too many instructions', () => {
    const rows = [
      ['测试指令'],
      ...Array.from({ length: MULTI_ROUND_EXCEL_MAX_INSTRUCTIONS + 1 }, (_, i) => [`msg ${i}`]),
    ];
    expect(() => parseMultiRoundInstructionsFromRows(rows)).toThrow(/过多/);
  });
});

describe('parseMultiRoundExcelFromRows', () => {
  it('reads overall expected success from the first non-empty cell', () => {
    const rows = [
      ['轮次', '测试指令', '攻击成功预期'],
      ['1', '指令一', '套取管理员凭证'],
      ['2', '指令二', ''],
    ];
    const result = parseMultiRoundExcelFromRows(rows);
    expect(result.instructions).toHaveLength(2);
    expect(result.expectedSuccess).toBe('套取管理员凭证');
  });
});
