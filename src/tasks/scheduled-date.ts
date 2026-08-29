import type { TimestampMs } from '../timer/session';

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const scheduledDatePattern =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/;

export function parseScheduledDate(due: string | null | undefined): CivilDate | null {
  if (!due) {
    return null;
  }

  const match = scheduledDatePattern.exec(due);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return isValidCivilDate(year, month, day) ? { year, month, day } : null;
}

export function getLocalCivilDate(timestampMs: TimestampMs): CivilDate {
  const date = new Date(timestampMs);

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

export function compareCivilDates(left: CivilDate, right: CivilDate): -1 | 0 | 1 {
  const leftValue = civilDateValue(left);
  const rightValue = civilDateValue(right);

  return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
}

function civilDateValue(date: CivilDate): number {
  return date.year * 10_000 + date.month * 100 + date.day;
}

function isValidCivilDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= daysInMonth(year, month);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
