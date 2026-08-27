import {
  offsetToLineColumn,
  resolveJsonPointer,
} from '../../backend/src/services/attackTaskJudgment/evaluateDetectionRulesForResponse';

describe('evaluateDetectionRulesForResponse helpers', () => {
  it('offsetToLineColumn uses 1-based lines and columns', () => {
    const text = 'a\nbb\nccc';
    expect(offsetToLineColumn(text, 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToLineColumn(text, 2)).toEqual({ line: 2, column: 1 });
    expect(offsetToLineColumn(text, 3)).toEqual({ line: 2, column: 2 });
    expect(offsetToLineColumn(text, 6)).toEqual({ line: 3, column: 2 });
  });

  it('resolveJsonPointer reads RFC6901 paths', () => {
    const doc = { app: { name: 'x' }, list: [{ id: 1 }] };
    expect(resolveJsonPointer(doc, '')).toBe(doc);
    expect(resolveJsonPointer(doc, '/app/name')).toBe('x');
    expect(resolveJsonPointer(doc, '/list/0/id')).toBe(1);
    expect(resolveJsonPointer(doc, '/missing')).toBeUndefined();
  });
});
