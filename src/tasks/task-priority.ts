import type { GoogleTaskListItem } from '../google/task-lists';
import type { GoogleTaskItem } from '../google/tasks';
import type { GoogleTaskListLoad } from '../google/tasks-catalog';
import { type CivilDate, compareCivilDates, parseScheduledDate } from './scheduled-date';

export type TaskPriorityGroup = 'overdue' | 'today' | 'undated' | 'future';

export interface PrioritizedGoogleTask {
  readonly task: GoogleTaskItem;
  readonly taskList: GoogleTaskListItem;
  readonly group: TaskPriorityGroup;
  readonly scheduledDate?: CivilDate;
}

interface SortableTask extends PrioritizedGoogleTask {
  readonly taskListIndex: number;
}

const groupOrder: Record<TaskPriorityGroup, number> = {
  overdue: 0,
  today: 1,
  undated: 2,
  future: 3,
};

export function prioritizeGoogleTasks(
  taskLists: readonly GoogleTaskListLoad[],
  today: CivilDate,
): readonly PrioritizedGoogleTask[] {
  const items: SortableTask[] = [];

  taskLists.forEach((loadedTaskList, taskListIndex) => {
    if (loadedTaskList.status === 'pending') {
      return;
    }

    for (const task of loadedTaskList.tasks) {
      const scheduledDate = parseScheduledDate(task.due);
      items.push({
        task,
        taskList: loadedTaskList.taskList,
        group: getPriorityGroup(scheduledDate, today),
        ...(scheduledDate ? { scheduledDate } : {}),
        taskListIndex,
      });
    }
  });

  items.sort(comparePrioritizedTasks);

  return items.map(({ taskListIndex: _, ...item }) => item);
}

function getPriorityGroup(scheduledDate: CivilDate | null, today: CivilDate): TaskPriorityGroup {
  if (scheduledDate === null) {
    return 'undated';
  }

  const comparison = compareCivilDates(scheduledDate, today);
  return comparison < 0 ? 'overdue' : comparison === 0 ? 'today' : 'future';
}

function comparePrioritizedTasks(left: SortableTask, right: SortableTask): number {
  const groupComparison = groupOrder[left.group] - groupOrder[right.group];

  if (groupComparison !== 0) {
    return groupComparison;
  }

  if (left.scheduledDate && right.scheduledDate) {
    const dateComparison = compareCivilDates(left.scheduledDate, right.scheduledDate);

    if (dateComparison !== 0) {
      return dateComparison;
    }
  }

  if (left.taskListIndex !== right.taskListIndex) {
    return left.taskListIndex - right.taskListIndex;
  }

  const positionComparison = compareStrings(left.task.position, right.task.position);
  return positionComparison !== 0
    ? positionComparison
    : compareStrings(left.task.id, right.task.id);
}

function compareStrings(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
