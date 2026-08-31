import type { CompletedSession, DurationMs, TimestampMs } from '../../src/timer/session';

export function formatDuration(durationMs: DurationMs): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':');
}

export function formatSessionInterval(session: CompletedSession): string {
  const startedAt = new Date(session.startedAtMs);
  const endedAt = new Date(session.endedAtMs);

  if (haveSameLocalDate(startedAt, endedAt)) {
    return `${formatLocalDate(startedAt)} · ${formatLocalTime(startedAt)}–${formatLocalTime(endedAt)}`;
  }

  return `${formatLocalDateTime(session.startedAtMs)} → ${formatLocalDateTime(session.endedAtMs)}`;
}

function formatLocalDateTime(timestampMs: TimestampMs): string {
  const date = new Date(timestampMs);
  return `${formatLocalDate(date)} ${formatLocalTime(date)}`;
}

function formatLocalDate(date: Date): string {
  return [date.getDate(), date.getMonth() + 1, date.getFullYear()]
    .map((value) => value.toString().padStart(2, '0'))
    .join('/');
}

function formatLocalTime(date: Date): string {
  return [date.getHours(), date.getMinutes()]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

function haveSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
