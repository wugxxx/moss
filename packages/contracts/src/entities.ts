export type EntityId = string;
export type IsoDate = string;
export type IsoTimestamp = string;

export type TaskStatus = 'backlog' | 'todo' | 'progress' | 'review' | 'done';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export interface Subtask {
  id: EntityId;
  title: string;
  done: boolean;
  due?: IsoDate | null;
  assignee?: EntityId | null;
  note?: string;
}

export interface Attachment {
  id: EntityId;
  name: string;
  type: string;
  size: string;
  by: EntityId | null;
  at: number;
  contentType?: string | null;
  byteSize?: number | null;
  sha256?: string | null;
  storageKey?: string | null;
}

export interface Task {
  id: EntityId;
  project: EntityId;
  key: string;
  title: string;
  status: TaskStatus;
  assignee: EntityId | null;
  priority: TaskPriority;
  due: IsoDate | null;
  start: IsoDate | null;
  labels: string[];
  subtasks: Subtask[];
  attachments: Attachment[];
  deps: EntityId[];
  desc: string;
  estimate: string | null;
  created: number;
  updated: number;
  order: number;
  fav: boolean;
  recur: string | null;
  completedAt?: number | null;
  prevStatus?: TaskStatus | null;
  archived?: boolean;
  archivedAt?: number | null;
  revision: number;
}

export interface Project {
  id: EntityId;
  key: string;
  name: string;
  icon: string;
  color: string;
  status: string;
  team: string;
  lead: EntityId;
  due: IsoDate;
  start: IsoDate;
  fav: boolean;
  members: EntityId[];
  desc: string;
  milestones: Array<{ name: string; date: IsoDate }>;
  last: number;
  seq?: number;
  archived?: boolean;
  archivedAt?: number | null;
  private?: boolean;
  revision: number;
}

export interface Member {
  id: EntityId;
  name: string;
  email: string;
  role: string;
  team: string;
  title: string;
  c: string;
  status: string;
  last: number | null;
  tz: string;
}

export interface Comment {
  id: EntityId;
  task: EntityId;
  by: EntityId;
  at: number;
  text: string;
  re: Record<string, EntityId[]>;
}

export interface Activity {
  id: EntityId;
  by: EntityId | null;
  verb: string;
  task: EntityId | null;
  project: EntityId | null;
  at: number;
  extra: string;
}

export interface FileRecord {
  id: EntityId;
  project: EntityId;
  task?: EntityId | null;
  name: string;
  type: string;
  size: string;
  by: EntityId | null;
  at: number;
  contentType?: string | null;
  byteSize?: number | null;
  sha256?: string | null;
  storageKey?: string | null;
}

export interface SavedView {
  id: EntityId;
  project: EntityId;
  name: string;
  type: string;
  filters: Array<{ f: string; op: string; v: string[] }>;
}

export interface CalendarEvent {
  id: EntityId;
  title: string;
  date: IsoDate;
  time: string;
  project: EntityId;
  notes?: string;
}

export interface WorkspaceSnapshot {
  ws: {
    name: string;
    url?: string;
    c?: string;
    brand?: boolean;
  };
  workspaces: Array<Record<string, unknown>>;
  me: EntityId;
  members: Member[];
  projects: Project[];
  tasks: Task[];
  comments: Comment[];
  activity: Activity[];
  notifs: Array<Record<string, unknown>>;
  files: FileRecord[];
  events: CalendarEvent[];
  projOrder: EntityId[];
  savedViews: SavedView[];
  recentSearches: string[];
  sessions: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  tfa: boolean;
  notifPrefs: Record<string, boolean>;
}
