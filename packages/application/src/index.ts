import type {
  CalendarEvent,
  CommandResult,
  EntityId,
  FileRecord,
  Project,
  ProjectTaskCreateInput,
  ProjectPatch,
  Task,
  TaskCreateInput,
  TaskPatch,
  WorkspaceCommand,
  WorkspaceSnapshot,
} from '@moss/contracts';
import { createEntityId } from '@moss/contracts';
import { nextRecurringTask, normalizeTaskDates, projectKey, taskOrder } from '@moss/domain';

export interface WorkspaceCommitContext {
  command: WorkspaceCommand;
  previous: WorkspaceSnapshot;
  snapshot: WorkspaceSnapshot;
  result: CommandResult;
}

export interface WorkspaceRepository {
  snapshot(): WorkspaceSnapshot;
  replaceSnapshot(snapshot: WorkspaceSnapshot): void;
  findCommandResult(clientCommandId: string): CommandResult | null;
  findCommandReceipt(clientCommandId: string): CommandReceipt | null;
  commit(context: WorkspaceCommitContext): void;
  atomic<T>(run: () => T): T;
  atomicBatch<T>(run: () => T): T;
}

export interface CommandReceipt {
  result: CommandResult;
  revision: number;
}

class BatchCommandError extends Error {
  constructor(readonly results: CommandResult[]) {
    super('Batch command failed');
  }
}

function now() {
  return Date.now();
}

function nextId(): string {
  return createEntityId();
}

function projectById(snapshot: WorkspaceSnapshot, id: EntityId): Project {
  const project = snapshot.projects.find(item => item.id === id);
  if (!project) throw new Error(`Project ${id} was not found`);
  return project;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function assertProjectSchedule(start: string, due: string, milestones: Project['milestones']): void {
  if (!isIsoDate(start)) throw new Error('Project start date is invalid');
  if (!isIsoDate(due)) throw new Error('Project target date is invalid');
  if (start > due) throw new Error('Project start date cannot be after its target date');
  for (const milestone of milestones) {
    if (!milestone.name.trim()) throw new Error('Milestone name is required');
    if (!isIsoDate(milestone.date)) throw new Error(`Milestone “${milestone.name}” has an invalid date`);
  }
}

function normalizeMilestones(milestones: Project['milestones']): Project['milestones'] {
  return milestones.map(milestone => ({ name: milestone.name.trim(), date: milestone.date }));
}

function normalizeEvent(event: CalendarEvent): CalendarEvent {
  const title = event.title.trim();
  const notes = event.notes?.trim();
  return {
    id: event.id,
    title,
    date: event.date,
    time: event.time,
    project: event.project,
    ...(notes ? { notes } : {}),
  };
}

function assertEvent(snapshot: WorkspaceSnapshot, event: CalendarEvent, existingId?: EntityId): void {
  if (!event.id.trim()) throw new Error('Calendar event ID is required');
  const duplicate = snapshot.events.find(item => item.id === event.id);
  if (duplicate && duplicate.id !== existingId) throw new Error(`Calendar event ${event.id} already exists`);
  if (!event.title.trim()) throw new Error('Calendar event title is required');
  if (!isIsoDate(event.date)) throw new Error('Calendar event date is invalid');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)) throw new Error('Calendar event time is invalid');
  projectById(snapshot, event.project);
}

function nextTaskKey(project: Project, snapshot: WorkspaceSnapshot): string {
  const max = Math.max(project.seq ?? 200, ...snapshot.tasks.filter(task => task.project === project.id).map(task => Number(task.key.split('-').at(-1)) || 0));
  project.seq = max + 1;
  return `${project.key}-${project.seq}`;
}

function revision(snapshot: WorkspaceSnapshot): number {
  return Math.max(0, ...snapshot.tasks.map(task => task.revision), ...snapshot.projects.map(project => project.revision));
}

function touchTask(task: Task): Task {
  return { ...task, updated: now(), revision: task.revision + 1 };
}

function touchProject(project: Project): Project {
  return { ...project, last: now(), revision: project.revision + 1 };
}

function appendActivity(
  snapshot: WorkspaceSnapshot,
  entry: {
    verb: string;
    task?: Task | null;
    project?: Project | null;
    extra?: string;
  },
): void {
  snapshot.activity.unshift({
    id: nextId(),
    by: snapshot.me,
    verb: entry.verb,
    task: entry.task?.id ?? null,
    project: entry.project?.id ?? entry.task?.project ?? null,
    at: now(),
    extra: entry.extra ?? '',
  });
}

function displayDate(value: string | null): string {
  if (!value) return '(cleared)';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function appendTaskPatchActivity(snapshot: WorkspaceSnapshot, previous: Task, next: Task, patch: TaskPatch): void {
  const priorityName = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  for (const key of Object.keys(patch) as Array<keyof TaskPatch>) {
    if (JSON.stringify(previous[key]) === JSON.stringify(next[key])) continue;
    switch (key) {
      case 'status':
        if (next.status === 'done') appendActivity(snapshot, { verb: 'completed', task: next });
        else appendActivity(snapshot, { verb: 'moved', task: next, extra: `from ${previous.status} to ${next.status}` });
        break;
      case 'project':
        appendActivity(snapshot, {
          verb: 'moved',
          task: next,
          extra: `to ${snapshot.projects.find(project => project.id === next.project)?.name ?? 'another project'}`,
        });
        break;
      case 'title':
        appendActivity(snapshot, { verb: 'renamed', task: next, extra: `to “${next.title}”` });
        break;
      case 'assignee':
        appendActivity(snapshot, {
          verb: 'assigned',
          task: next,
          extra: next.assignee ? `to ${snapshot.members.find(member => member.id === next.assignee)?.name ?? 'a collaborator'}` : '(unassigned)',
        });
        break;
      case 'priority':
        appendActivity(snapshot, { verb: 'changed priority of', task: next, extra: `to ${priorityName(next.priority)}` });
        break;
      case 'due':
        appendActivity(snapshot, { verb: 'changed due date of', task: next, extra: `to ${displayDate(next.due)}` });
        break;
      case 'start':
        appendActivity(snapshot, { verb: 'changed start date of', task: next, extra: `to ${displayDate(next.start)}` });
        break;
      case 'labels':
        appendActivity(snapshot, { verb: 'updated labels on', task: next });
        break;
      case 'recur':
        appendActivity(snapshot, { verb: 'set repeat on', task: next, extra: next.recur ? next.recur.toLowerCase() : 'off' });
        break;
      case 'estimate':
        appendActivity(snapshot, { verb: 'estimated', task: next, extra: next.estimate ?? 'none' });
        break;
      case 'deps':
        appendActivity(snapshot, { verb: 'updated dependencies of', task: next });
        break;
      case 'subtasks': {
        const added = next.subtasks.length - previous.subtasks.length;
        if (added > 0) appendActivity(snapshot, { verb: 'added subtask to', task: next, extra: `“${next.subtasks.at(-1)?.title ?? ''}”` });
        else if (added < 0) appendActivity(snapshot, { verb: 'removed a subtask from', task: next });
        else appendActivity(snapshot, { verb: 'updated subtasks on', task: next });
        break;
      }
      case 'attachments':
        appendActivity(snapshot, {
          verb: next.attachments.length > previous.attachments.length ? 'added a file to' : 'removed a file from',
          task: next,
        });
        break;
      case 'desc':
        appendActivity(snapshot, { verb: 'updated the description of', task: next });
        break;
      default:
        appendActivity(snapshot, { verb: 'updated', task: next });
    }
  }
}

function appendProjectPatchActivity(snapshot: WorkspaceSnapshot, previous: Project, next: Project): void {
  if (previous.name !== next.name) appendActivity(snapshot, { verb: 'renamed project', project: next, extra: `to “${next.name}”` });
  if (previous.status !== next.status) appendActivity(snapshot, { verb: 'changed status of project', project: next, extra: `to ${next.status}` });
  if (previous.desc !== next.desc) appendActivity(snapshot, { verb: 'updated project', project: next });
}

function createTaskRecord(snapshot: WorkspaceSnapshot, project: Project, input: TaskCreateInput | ProjectTaskCreateInput): Task {
  const task: Task = {
    id: nextId(),
    project: project.id,
    key: nextTaskKey(project, snapshot),
    title: input.title,
    status: input.status ?? 'todo',
    assignee: input.assignee ?? null,
    priority: input.priority ?? 'none',
    due: input.due ?? null,
    start: input.start ?? null,
    labels: input.labels ?? [],
    subtasks: input.subtasks ?? [],
    attachments: input.attachments ?? [],
    deps: [],
    desc: input.desc ?? '',
    estimate: input.estimate ?? null,
    created: now(),
    updated: now(),
    order: input.order ?? taskOrder(snapshot.tasks),
    fav: input.fav ?? false,
    recur: input.recur ?? null,
    revision: 0,
  };
  snapshot.tasks.push(normalizeTaskDates(task));
  indexAttachments(snapshot, task);
  return task;
}

function indexAttachments(snapshot: WorkspaceSnapshot, task: Task): void {
  for (const attachment of task.attachments) {
    if (snapshot.files.some(file => file.id === attachment.id)) continue;
    snapshot.files.unshift({
      id: attachment.id,
      project: task.project,
      task: task.id,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      by: attachment.by,
      at: attachment.at,
      contentType: attachment.contentType ?? null,
      byteSize: attachment.byteSize ?? null,
      sha256: attachment.sha256 ?? null,
      storageKey: attachment.storageKey ?? null,
    });
  }
}

function syncFileToTaskAttachment(snapshot: WorkspaceSnapshot, file: FileRecord): void {
  if (!file.task) return;
  const parent = snapshot.tasks.find(task => task.id === file.task);
  if (!parent || parent.attachments.some(attachment => attachment.id === file.id)) return;
  parent.attachments.push({
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
    by: file.by,
    at: file.at,
    contentType: file.contentType ?? null,
    byteSize: file.byteSize ?? null,
    sha256: file.sha256 ?? null,
    storageKey: file.storageKey ?? null,
  });
}

function applyTaskPatch(task: Task, patch: TaskPatch, snapshot: WorkspaceSnapshot): Task {
  const next = { ...task };
  if (patch.project && patch.project !== task.project) {
    next.key = nextTaskKey(projectById(snapshot, patch.project), snapshot);
  }
  Object.assign(next, patch);
  if (next.status === 'done' && task.status !== 'done') {
    next.completedAt = now();
    next.prevStatus = task.status;
  }
  if (next.status !== 'done' && task.status === 'done') {
    next.completedAt = null;
  }
  return normalizeTaskDates(touchTask(next));
}

export class WorkspaceApplication {
  constructor(private readonly repository: WorkspaceRepository) {}

  snapshot(): WorkspaceSnapshot {
    return structuredClone(this.repository.snapshot());
  }

  replaceSnapshot(snapshot: WorkspaceSnapshot): void {
    this.repository.replaceSnapshot(snapshot);
  }

  execute(command: WorkspaceCommand): CommandResult {
    const cached = this.repository.findCommandResult(command.clientCommandId);
    if (cached) return cached;

    try {
      return this.repository.atomic(() => {
        const previous = this.repository.snapshot();
        const snapshot = structuredClone(previous);
        const affected = this.apply(snapshot, command);
        const result: CommandResult = {
          ok: true,
          commandId: command.clientCommandId,
          affected,
          revision: revision(snapshot),
        };
        this.repository.commit({ command, previous, snapshot, result });
        return result;
      });
    } catch (error) {
      return {
        ok: false,
        commandId: command.clientCommandId,
        error: {
          code: 'COMMAND_FAILED',
          message: error instanceof Error ? error.message : 'Command failed',
        },
      };
    }
  }

  hasCommandResult(clientCommandId: string): boolean {
    return this.repository.findCommandResult(clientCommandId) !== null;
  }

  commandReceipt(command: WorkspaceCommand): CommandReceipt {
    return (
      this.repository.findCommandReceipt(command.clientCommandId) ?? {
        result: this.execute(command),
        revision: revision(this.snapshot()),
      }
    );
  }

  executeBatch(commands: WorkspaceCommand[]): CommandResult[] {
    if (!commands.length) return [];

    try {
      return this.repository.atomicBatch(() => {
        const results: CommandResult[] = [];
        for (const command of commands) {
          const result = this.execute(command);
          results.push(result);
          if (!result.ok) {
            throw new BatchCommandError(results);
          }
        }
        return results;
      });
    } catch (error) {
      if (error instanceof BatchCommandError) return error.results;
      throw error;
    }
  }

  private apply(snapshot: WorkspaceSnapshot, command: WorkspaceCommand): { type: 'task' | 'project' | 'workspace'; ids: EntityId[] } {
    switch (command.type) {
      case 'task.create': {
        const project = projectById(snapshot, command.payload.projectId);
        const task = createTaskRecord(snapshot, project, command.payload);
        appendActivity(snapshot, { verb: 'created', task });
        return { type: 'task', ids: [task.id] };
      }
      case 'task.patch': {
        const index = snapshot.tasks.findIndex(task => task.id === command.entityId);
        if (index < 0) throw new Error(`Task ${command.entityId} was not found`);
        const previous = snapshot.tasks[index]!;
        const next = applyTaskPatch(previous, command.payload.patch, snapshot);
        snapshot.tasks[index] = next;
        indexAttachments(snapshot, next);
        appendTaskPatchActivity(snapshot, previous, next, command.payload.patch);
        if (next.status === 'done' && previous.status !== 'done') {
          const recurring = nextRecurringTask(next);
          if (recurring) {
            const project = projectById(snapshot, recurring.project);
            recurring.id = nextId();
            recurring.key = nextTaskKey(project, snapshot);
            snapshot.tasks.push(recurring);
          }
        }
        return { type: 'task', ids: [next.id] };
      }
      case 'task.move': {
        const index = snapshot.tasks.findIndex(task => task.id === command.entityId);
        if (index < 0) throw new Error(`Task ${command.entityId} was not found`);
        const previous = snapshot.tasks[index]!;
        const patch: TaskPatch = { order: command.payload.order };
        if (command.payload.status) patch.status = command.payload.status;
        if (command.payload.projectId) patch.project = command.payload.projectId;
        snapshot.tasks[index] = applyTaskPatch(snapshot.tasks[index]!, patch, snapshot);
        appendTaskPatchActivity(snapshot, previous, snapshot.tasks[index]!, patch);
        return { type: 'task', ids: [command.entityId] };
      }
      case 'task.archive': {
        const index = snapshot.tasks.findIndex(task => task.id === command.entityId);
        if (index < 0) throw new Error(`Task ${command.entityId} was not found`);
        snapshot.tasks[index] = touchTask({
          ...snapshot.tasks[index]!,
          archived: true,
          archivedAt: now(),
        });
        appendActivity(snapshot, { verb: 'archived', task: snapshot.tasks[index]! });
        return { type: 'task', ids: [command.entityId] };
      }
      case 'task.restore': {
        const index = snapshot.tasks.findIndex(task => task.id === command.entityId);
        if (index < 0) throw new Error(`Task ${command.entityId} was not found`);
        snapshot.tasks[index] = touchTask({
          ...snapshot.tasks[index]!,
          archived: false,
          archivedAt: null,
        });
        appendActivity(snapshot, { verb: 'restored', task: snapshot.tasks[index]! });
        return { type: 'task', ids: [command.entityId] };
      }
      case 'task.delete': {
        const ids = new Set([command.entityId]);
        snapshot.tasks = snapshot.tasks.filter(task => !ids.has(task.id));
        snapshot.files = snapshot.files.filter(file => !file.task || !ids.has(file.task));
        snapshot.tasks.forEach(task => {
          task.deps = task.deps.filter(id => !ids.has(id));
        });
        snapshot.comments = snapshot.comments.filter(comment => !ids.has(comment.task));
        return { type: 'task', ids: [command.entityId] };
      }
      case 'task.bulkPatch': {
        const ids = new Set(command.payload.ids);
        snapshot.tasks = snapshot.tasks.map(task => {
          if (!ids.has(task.id)) return task;
          const next = applyTaskPatch(task, command.payload.patch, snapshot);
          appendTaskPatchActivity(snapshot, task, next, command.payload.patch);
          return next;
        });
        return { type: 'task', ids: command.payload.ids };
      }
      case 'task.bulkDelete': {
        const ids = new Set(command.payload.ids);
        snapshot.tasks = snapshot.tasks.filter(task => !ids.has(task.id));
        snapshot.files = snapshot.files.filter(file => !file.task || !ids.has(file.task));
        snapshot.tasks.forEach(task => {
          task.deps = task.deps.filter(id => !ids.has(id));
        });
        snapshot.comments = snapshot.comments.filter(comment => !ids.has(comment.task));
        return { type: 'task', ids: command.payload.ids };
      }
      case 'task.batchMove': {
        const ids = new Set(command.payload.updates.map(update => update.id));
        snapshot.tasks = snapshot.tasks.map(task => {
          if (!ids.has(task.id)) return task;
          const update = command.payload.updates.find(item => item.id === task.id)!;
          const patch = { ...command.payload.patch, order: update.order };
          const next = applyTaskPatch(task, patch, snapshot);
          appendTaskPatchActivity(snapshot, task, next, patch);
          return next;
        });
        return { type: 'task', ids: [...ids] };
      }
      case 'task.bulkArchive': {
        const ids = new Set(command.payload.ids);
        snapshot.tasks = snapshot.tasks.map(task => (ids.has(task.id) ? touchTask({ ...task, archived: true, archivedAt: now() }) : task));
        return { type: 'task', ids: command.payload.ids };
      }
      case 'subtask.promote': {
        const parentIndex = snapshot.tasks.findIndex(task => task.id === command.entityId);
        if (parentIndex < 0) throw new Error(`Task ${command.entityId} was not found`);
        const parent = snapshot.tasks[parentIndex]!;
        const subtask = parent.subtasks.find(item => item.id === command.payload.subtaskId);
        if (!subtask) throw new Error(`Subtask ${command.payload.subtaskId} was not found`);
        const project = projectById(snapshot, parent.project);
        const promoted = createTaskRecord(snapshot, project, {
          title: subtask.title,
          status: subtask.done ? 'done' : 'todo',
          assignee: subtask.assignee ?? parent.assignee,
          priority: parent.priority,
          due: subtask.due ?? null,
          labels: [...parent.labels],
          desc: subtask.note ? `<p>${subtask.note}</p>` : '',
        });
        snapshot.tasks[parentIndex] = touchTask({
          ...parent,
          subtasks: parent.subtasks.filter(item => item.id !== subtask.id),
        });
        return { type: 'task', ids: [promoted.id] };
      }
      case 'project.create': {
        const member = snapshot.me;
        const start = command.payload.start ?? new Date().toISOString().slice(0, 10);
        const due = command.payload.due ?? new Date().toISOString().slice(0, 10);
        const milestones = normalizeMilestones(command.payload.milestones ?? []);
        assertProjectSchedule(start, due, milestones);
        const project: Project = {
          id: nextId(),
          key: projectKey(command.payload.name, snapshot.projects),
          name: command.payload.name,
          icon: command.payload.icon ?? 'folder',
          color: command.payload.color ?? 'indigo',
          status: 'planning',
          team: command.payload.team ?? snapshot.members.find(item => item.id === member)?.team ?? 'product',
          lead: command.payload.lead ?? member,
          due,
          start,
          fav: false,
          members: [...new Set([member, command.payload.lead ?? member])],
          desc: command.payload.desc ?? 'No description yet.',
          milestones,
          last: 0,
          revision: 0,
        };
        snapshot.projects.push(project);
        snapshot.projOrder.unshift(project.id);
        for (const input of command.payload.tasks ?? []) {
          createTaskRecord(snapshot, project, input);
        }
        appendActivity(snapshot, { verb: 'created project', project });
        return { type: 'project', ids: [project.id] };
      }
      case 'project.patch': {
        const index = snapshot.projects.findIndex(project => project.id === command.entityId);
        if (index < 0) throw new Error(`Project ${command.entityId} was not found`);
        const previousProject = snapshot.projects[index]!;
        const patch: ProjectPatch = {
          ...command.payload.patch,
          ...(command.payload.patch.milestones ? { milestones: normalizeMilestones(command.payload.patch.milestones) } : {}),
        };
        const nextProject = { ...previousProject, ...patch };
        assertProjectSchedule(nextProject.start, nextProject.due, nextProject.milestones);
        snapshot.projects[index] = touchProject(nextProject);
        appendProjectPatchActivity(snapshot, previousProject, snapshot.projects[index]!);
        return { type: 'project', ids: [command.entityId] };
      }
      case 'project.reorder': {
        snapshot.projOrder = [...command.payload.orderedIds];
        return { type: 'project', ids: command.payload.orderedIds };
      }
      case 'project.archive': {
        const project = projectById(snapshot, command.entityId);
        Object.assign(project, touchProject({ ...project, archived: true, archivedAt: now() }));
        return { type: 'project', ids: [project.id] };
      }
      case 'project.restore': {
        const project = projectById(snapshot, command.entityId);
        Object.assign(project, touchProject({ ...project, archived: false, archivedAt: null }));
        return { type: 'project', ids: [project.id] };
      }
      case 'project.delete': {
        const project = projectById(snapshot, command.entityId);
        const taskIds = new Set(snapshot.tasks.filter(task => task.project === project.id).map(task => task.id));
        snapshot.tasks = snapshot.tasks.filter(task => !taskIds.has(task.id));
        snapshot.comments = snapshot.comments.filter(comment => !taskIds.has(comment.task));
        snapshot.files = snapshot.files.filter(file => file.project !== project.id);
        snapshot.projects = snapshot.projects.filter(item => item.id !== project.id);
        snapshot.projOrder = snapshot.projOrder.filter(id => id !== project.id);
        return { type: 'project', ids: [project.id] };
      }
      case 'event.create': {
        const event = normalizeEvent(command.payload.event);
        assertEvent(snapshot, event);
        snapshot.events.push(event);
        return { type: 'workspace', ids: [event.id] };
      }
      case 'event.patch': {
        const index = snapshot.events.findIndex(event => event.id === command.entityId);
        if (index < 0) throw new Error(`Calendar event ${command.entityId} was not found`);
        const previous = snapshot.events[index]!;
        const event = normalizeEvent({ ...previous, ...command.payload.patch });
        assertEvent(snapshot, event, previous.id);
        snapshot.events[index] = event;
        return { type: 'workspace', ids: [event.id] };
      }
      case 'event.delete': {
        const index = snapshot.events.findIndex(event => event.id === command.entityId);
        if (index < 0) throw new Error(`Calendar event ${command.entityId} was not found`);
        snapshot.events.splice(index, 1);
        return { type: 'workspace', ids: [command.entityId] };
      }
      case 'file.create': {
        if (snapshot.files.some(file => file.id === command.payload.file.id)) {
          throw new Error(`File ${command.payload.file.id} already exists`);
        }
        snapshot.files.unshift({ ...command.payload.file });
        syncFileToTaskAttachment(snapshot, command.payload.file);
        return { type: 'workspace', ids: [command.payload.file.id] };
      }
      case 'file.patch': {
        const index = snapshot.files.findIndex(file => file.id === command.entityId);
        if (index < 0) throw new Error(`File ${command.entityId} was not found`);
        const previous = snapshot.files[index]!;
        snapshot.files[index] = { ...previous, ...command.payload.patch };
        const next = snapshot.files[index]!;
        const attachment = snapshot.tasks.flatMap(task => task.attachments).find(item => item.id === next.id);
        if (attachment)
          Object.assign(attachment, {
            name: next.name,
            type: next.type,
            size: next.size,
          });
        return { type: 'workspace', ids: [next.id] };
      }
      case 'file.delete': {
        const file = snapshot.files.find(item => item.id === command.entityId);
        if (!file) throw new Error(`File ${command.entityId} was not found`);
        snapshot.files = snapshot.files.filter(item => item.id !== file.id);
        for (const task of snapshot.tasks) {
          task.attachments = task.attachments.filter(attachment => attachment.id !== file.id);
        }
        return { type: 'workspace', ids: [file.id] };
      }
      case 'savedView.create': {
        if (snapshot.savedViews.some(view => view.id === command.payload.view.id)) {
          throw new Error(`Saved view ${command.payload.view.id} already exists`);
        }
        snapshot.savedViews.push(structuredClone(command.payload.view));
        return { type: 'workspace', ids: [command.payload.view.id] };
      }
      case 'savedView.patch': {
        const index = snapshot.savedViews.findIndex(view => view.id === command.entityId);
        if (index < 0) throw new Error(`Saved view ${command.entityId} was not found`);
        snapshot.savedViews[index] = {
          ...snapshot.savedViews[index]!,
          ...command.payload.patch,
        };
        return { type: 'workspace', ids: [command.entityId] };
      }
      case 'savedView.delete': {
        const exists = snapshot.savedViews.some(view => view.id === command.entityId);
        if (!exists) throw new Error(`Saved view ${command.entityId} was not found`);
        snapshot.savedViews = snapshot.savedViews.filter(view => view.id !== command.entityId);
        return { type: 'workspace', ids: [command.entityId] };
      }
      case 'comment.delete': {
        const exists = snapshot.comments.some(comment => comment.id === command.entityId);
        if (!exists) throw new Error(`Comment ${command.entityId} was not found`);
        snapshot.comments = snapshot.comments.filter(comment => comment.id !== command.entityId);
        return { type: 'workspace', ids: [command.entityId] };
      }
      case 'member.patch': {
        const index = snapshot.members.findIndex(member => member.id === command.entityId);
        if (index < 0) throw new Error(`Member ${command.entityId} was not found`);
        snapshot.members[index] = { ...snapshot.members[index]!, ...command.payload.patch };
        return { type: 'workspace', ids: [command.entityId] };
      }
      case 'recentSearch.add': {
        const query = command.payload.query.trim();
        if (!query) return { type: 'workspace', ids: [] };
        const limit = command.payload.limit ?? 5;
        snapshot.recentSearches = [query, ...snapshot.recentSearches.filter(item => item !== query)].slice(0, limit);
        return { type: 'workspace', ids: [] };
      }
    }
  }
}
