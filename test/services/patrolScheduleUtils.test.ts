import {
  computeInitialNextRunAt,
  computeNextRunAtAfterRun,
  isPatrolPlanDue,
  type PatrolPlanSchedule,
} from '../../backend/src/services/patrolScheduleUtils';

const basePlan: PatrolPlanSchedule = {
  frequency: 'daily',
  firstRunAt: '2026-07-09',
  runAtTime: '07:05',
  enabled: true,
};

describe('patrolScheduleUtils', () => {
  it('computes initial next run from firstRunAt and runAtTime', () => {
    const next = computeInitialNextRunAt(basePlan, new Date('2026-07-08T10:00:00.000Z'));
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(6);
    expect(next.getDate()).toBe(9);
    expect(next.getHours()).toBe(7);
    expect(next.getMinutes()).toBe(5);
  });

  it('keeps the configured first run time when it is already in the past', () => {
    const next = computeInitialNextRunAt(basePlan, new Date('2026-07-09T08:00:00'));
    expect(next.getDate()).toBe(9);
    expect(next.getHours()).toBe(7);
    expect(next.getMinutes()).toBe(5);
  });

  it('treats missed first runs as due even without nextRunAt', () => {
    const due = isPatrolPlanDue(basePlan, new Date('2026-07-09T08:00:00'));
    expect(due).toBe(true);
  });

  it('computes weekly and monthly next runs', () => {
    const weekly = computeNextRunAtAfterRun(
      { ...basePlan, frequency: 'weekly' },
      new Date('2026-07-09T07:05:00'),
    );
    expect(weekly.getDate()).toBe(16);

    const monthly = computeNextRunAtAfterRun(
      { ...basePlan, frequency: 'monthly' },
      new Date('2026-07-09T07:05:00'),
    );
    expect(monthly.getMonth()).toBe(7);
    expect(monthly.getDate()).toBe(9);
  });

  it('marks expired nextRunAt as due', () => {
    const due = isPatrolPlanDue(
      {
        ...basePlan,
        nextRunAt: '2026-07-09T07:05:00.000Z',
      },
      new Date('2026-07-09T08:00:00.000Z'),
    );
    expect(due).toBe(true);
  });

  it('skips disabled plans', () => {
    const due = isPatrolPlanDue(
      {
        ...basePlan,
        enabled: false,
        nextRunAt: '2026-07-09T07:05:00.000Z',
      },
      new Date('2026-07-09T08:00:00.000Z'),
    );
    expect(due).toBe(false);
  });
});
