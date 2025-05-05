import { tasks_v1 } from "googleapis";

/**
 * Google Tasks API interfaces
 */

// Task List related interfaces
export interface TaskListRequestParams {
  maxResults?: number;
  pageToken?: string;
}

export interface TaskListCreateParams {
  title: string;
}

export interface TaskListUpdateParams {
  id: string;
  title: string;
}

export interface TaskListGetParams {
  id: string;
}

export interface TaskListDeleteParams {
  id: string;
}

// Task related interfaces
export interface TaskRequestParams {
  taskListId?: string;
  cursor?: string;
}

export interface TaskSearchParams {
  query: string;
  taskListId?: string;
}

export interface TaskCreateParams {
  taskListId?: string;
  title: string;
  notes?: string;
  due?: string;
  status?: 'needsAction' | 'completed';
  parent?: string;
}

export interface TaskUpdateParams {
  taskListId?: string;
  id: string;
  title?: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string;
  parent?: string;
}

export interface TaskMoveParams {
  taskListId?: string;
  id: string;
  parent?: string;
  previous?: string;
}

export interface TaskGetParams {
  taskListId?: string;
  id: string;
}

export interface TaskDeleteParams {
  taskListId?: string;
  id: string;
}

export interface TaskClearParams {
  taskListId?: string;
}

/**
 * MCP Resource types
 */
export interface TaskListResource {
  uri: string;
  mimeType: string;
  name: string;
  description: string;
}

export interface TaskResource {
  uri: string;
  mimeType: string;
  name: string;
  description: string;
}

/**
 * Utility types for interacting with Google Tasks API
 */
export interface TasksClient {
  tasks: tasks_v1.Tasks;
}