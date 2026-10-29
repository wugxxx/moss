import type {
  Attachment,
  CalendarEvent,
  EntityId,
  FileRecord,
  IsoDate,
  IsoTimestamp,
  Member,
  Project,
  SavedView,
  Subtask,
  Task,
  TaskPriority,
  TaskStatus,
} from './entities.js';

export interface CommandContext {
  workspaceId: string;
  deviceId: string;
  actorId: EntityId;
  clientCommandId: string;
  createdAt: IsoTimestamp;
  baseRevision?: number | null;
}

export interface TaskCreateInput {
  projectId: EntityId;
  title: string;
  status?: TaskStatus;
  assignee?: EntityId | null;
  priority?: TaskPriority;
  due?: IsoDate | null;
  start?: IsoDate | null;
  labels?: string[];
  subtasks?: Subtask[];
  attachments?: Attachment[];
  desc?: string;
  recur?: string | null;
  fav?: boolean;
  order?: number;
  estimate?: string | null;
}

export type ProjectTaskCreateInput = Omit<TaskCreateInput, 'projectId'>;

export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'status'
    | 'assignee'
    | 'priority'
    | 'due'
    | 'start'
    | 'labels'
    | 'desc'
    | 'recur'
    | 'estimate'
    | 'deps'
    | 'fav'
    | 'order'
    | 'subtasks'
    | 'attachments'
  >
> & { project?: EntityId };

export type TaskCommand =
  | (CommandContext & { type: 'task.create'; payload: TaskCreateInput })
  | (CommandContext & {
      type: 'task.patch';
      entityId: EntityId;
      payload: { patch: TaskPatch };
    })
  | (CommandContext & {
      type: 'task.move';
      entityId: EntityId;
      payload: { order: number; status?: TaskStatus; projectId?: EntityId };
    })
  | (CommandContext & {
      type: 'task.archive';
      entityId: EntityId;
      payload: Record<string, never>;
    })
  | (CommandContext & {
      type: 'task.restore';
      entityId: EntityId;
      payload: Record<string, never>;
    })
  | (CommandContext & {
      type: 'task.delete';
      entityId: EntityId;
      payload: Record<string, never>;
    })
  | (CommandContext & {
      type: 'task.bulkPatch';
      payload: { ids: EntityId[]; patch: TaskPatch };
    })
  | (CommandContext & {
      type: 'task.bulkDelete';
      payload: { ids: EntityId[] };
    })
  | (CommandContext & {
      type: 'task.batchMove';
      payload: {
        updates: Array<{ id: EntityId; order: number }>;
        patch?: TaskPatch;
      };
    })
  | (CommandContext & {
      type: 'task.bulkArchive';
      payload: { ids: EntityId[] };
    })
  | (CommandContext & {
      type: 'subtask.promote';
      entityId: EntityId;
      payload: { subtaskId: EntityId };
    });

export type ProjectPatch = Partial<
  Pick<Project, 'name' | 'desc' | 'icon' | 'color' | 'team' | 'lead' | 'start' | 'due' | 'members' | 'status' | 'fav' | 'milestones'>
>;

export type ProjectCommand =
  | (CommandContext & {
      type: 'project.create';
      payload: {
        name: string;
        desc?: string;
        icon?: string;
        color?: string;
        team?: string;
        lead?: EntityId;
        start?: IsoDate;
        due?: IsoDate;
        milestones?: Project['milestones'];
        tasks?: ProjectTaskCreateInput[];
      };
    })
  | (CommandContext & {
      type: 'project.patch';
      entityId: EntityId;
      payload: { patch: ProjectPatch };
    })
  | (CommandContext & {
      type: 'project.reorder';
      payload: { orderedIds: EntityId[] };
    })
  | (CommandContext & {
      type: 'project.archive';
      entityId: EntityId;
      payload: Record<string, never>;
    })
  | (CommandContext & {
      type: 'project.restore';
      entityId: EntityId;
      payload: Record<string, never>;
    })
  | (CommandContext & {
      type: 'project.delete';
      entityId: EntityId;
      payload: Record<string, never>;
    });

export type FilePatch = Partial<Pick<FileRecord, 'name' | 'type' | 'size' | 'task'>>;

export type FileCommand =
  | (CommandContext & {
      type: 'file.create';
      payload: { file: FileRecord };
    })
  | (CommandContext & {
      type: 'file.patch';
      entityId: EntityId;
      payload: { patch: FilePatch };
    })
  | (CommandContext & {
      type: 'file.delete';
      entityId: EntityId;
      payload: Record<string, never>;
    });

export type SavedViewCommand =
  | (CommandContext & {
      type: 'savedView.create';
      payload: { view: SavedView };
    })
  | (CommandContext & {
      type: 'savedView.patch';
      entityId: EntityId;
      payload: { patch: Partial<Pick<SavedView, 'name' | 'type' | 'filters'>> };
    })
  | (CommandContext & {
      type: 'savedView.delete';
      entityId: EntityId;
      payload: Record<string, never>;
    });

export type CommentCommand = CommandContext & {
  type: 'comment.delete';
  entityId: EntityId;
  payload: Record<string, never>;
};

export type EventPatch = Partial<Pick<CalendarEvent, 'title' | 'date' | 'time' | 'project' | 'notes'>>;

export type EventCommand =
  | (CommandContext & {
      type: 'event.create';
      payload: { event: CalendarEvent };
    })
  | (CommandContext & {
      type: 'event.patch';
      entityId: EntityId;
      payload: { patch: EventPatch };
    })
  | (CommandContext & {
      type: 'event.delete';
      entityId: EntityId;
      payload: Record<string, never>;
    });

export type MemberPatch = Partial<Pick<Member, 'name' | 'title' | 'email' | 'role' | 'team' | 'tz' | 'c'>>;

export type WorkspaceCommand =
  | TaskCommand
  | ProjectCommand
  | FileCommand
  | SavedViewCommand
  | CommentCommand
  | EventCommand
  | (CommandContext & {
      type: 'member.patch';
      entityId: EntityId;
      payload: { patch: MemberPatch };
    })
  | (CommandContext & {
      type: 'recentSearch.add';
      payload: { query: string; limit?: number };
    });

export type CommandResult =
  | {
      ok: true;
      commandId: string;
      affected: { type: 'task' | 'project' | 'workspace'; ids: EntityId[] };
      revision: number;
    }
  | {
      ok: false;
      commandId: string;
      error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    };
