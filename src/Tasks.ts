/**
 * Google Tasks MCP Server
 *
 * Copyright 2025 lsgrep
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  CallToolRequest,
  ErrorCode,
  ListResourcesRequest,
  McpError,
  ReadResourceRequest
} from "@modelcontextprotocol/sdk/types.js";
import {GaxiosError, GaxiosResponse} from "gaxios";
import {tasks_v1} from "googleapis";
import {TaskCreateParams} from "./types.js";

// Helper function to handle API errors consistently
function handleApiError(error: any, operation: string, errorCode: ErrorCode = ErrorCode.InternalError): never {
  console.error(`Error in ${operation}:`, error);
  
  // Handle GaxiosError specially to extract meaningful error data
  if (error && (error as GaxiosError).response) {
    const gaxiosError = error as GaxiosError;
    const status = gaxiosError.response?.status;
    const errorData = gaxiosError.response?.data;
    
    // Map HTTP error codes to MCP error codes
    if (status === 400) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid request parameters: ${errorData?.error?.message || 'Unknown error'}`);
    } else if (status === 401 || status === 403) {
      throw new McpError(ErrorCode.InvalidRequest, `Authentication error: ${errorData?.error?.message || 'Access denied'}`);
    } else if (status === 404) {
      throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${errorData?.error?.message || 'Resource does not exist'}`);
    }
  }
  
  // For other types of errors, use the provided error code
  throw new McpError(errorCode, `Failed during ${operation}: ${error.message || error}`);
}

const MAX_TASK_RESULTS = 100;
const MAX_TASKLIST_RESULTS = 100;

export class TaskListResources {
  static async list(
    request: ListResourcesRequest,
    tasks: tasks_v1.Tasks
  ): Promise<[tasks_v1.Schema$TaskList[], string | null]> {
    const pageSize = 10;
    const params: any = {
      maxResults: pageSize,
    };

    if (request.params?.cursor) {
      params.pageToken = request.params.cursor;
    }

    try {
      const response = await tasks.tasklists.list(params);
      const taskLists = response.data.items || [];
      const nextPageToken = response.data.nextPageToken || null;

      return [taskLists, nextPageToken];
    } catch (error) {
      handleApiError(error, "listing task lists");
    }
  }

  static async read(request: ReadResourceRequest, tasks: tasks_v1.Tasks) {
    // Extract taskList ID from URI
    const taskListId = request.params.uri.replace("gtasklists:///", "");

    try {
      const response = await tasks.tasklists.get({
        tasklist: taskListId,
      });

      return response.data;
    } catch (error) {
      handleApiError(error, `reading task list '${taskListId}'`, ErrorCode.InvalidRequest);
    }
  }
}

export class TaskResources {
  static async read(request: ReadResourceRequest, tasks: tasks_v1.Tasks) {
    const taskId = request.params.uri.replace("gtasks:///", "");
    
    // If the URI contains a task list ID, use it directly
    const taskListIdMatch = taskId.match(/^(.*?)\/tasks\/(.*?)$/);
    if (taskListIdMatch) {
      const [_, taskListId, specificTaskId] = taskListIdMatch;
      try {
        const taskResponse = await tasks.tasks.get({
          tasklist: taskListId,
          task: specificTaskId,
        });
        return taskResponse.data;
      } catch (error) {
        handleApiError(error, `reading task '${specificTaskId}' in list '${taskListId}'`, ErrorCode.InvalidRequest);
      }
    }

    // Otherwise search in all task lists
    try {
      const taskListsResponse: GaxiosResponse<tasks_v1.Schema$TaskLists> =
        await tasks.tasklists.list({
          maxResults: MAX_TASKLIST_RESULTS,
        });

      const taskLists = taskListsResponse.data.items || [];
      let task: tasks_v1.Schema$Task | null = null;
      let lastError: any = null;

      for (const taskList of taskLists) {
        if (taskList.id) {
          try {
            const taskResponse: GaxiosResponse<tasks_v1.Schema$Task> =
              await tasks.tasks.get({
                tasklist: taskList.id,
                task: taskId,
              });
            task = taskResponse.data;
            break;
          } catch (error) {
            // Store the last error, but continue searching in other lists
            lastError = error;
          }
        }
      }

      if (!task) {
        // If we've searched all lists and found nothing, throw a not found error
        throw new McpError(ErrorCode.InvalidRequest, `Task '${taskId}' not found in any task list`);
      }

      return task;
    } catch (error) {
      // Handle errors that could happen during the task lists listing
      if (error instanceof McpError) {
        throw error; // Rethrow existing McpError
      }
      handleApiError(error, `searching for task '${taskId}'`);
    }
  }

  static async list(
    request: ListResourcesRequest,
    tasks: tasks_v1.Tasks,
  ): Promise<[tasks_v1.Schema$Task[], string | null]> {
    const pageSize = 10;
    const params: any = {
      maxResults: pageSize,
    };

    if (request.params?.cursor) {
      params.pageToken = request.params.cursor;
    }
    
    try {
      // Get all task lists first
      const taskListsResponse = await tasks.tasklists.list({
        maxResults: MAX_TASKLIST_RESULTS,
      });

      const taskLists = taskListsResponse.data.items || [];

      // Create an array of promises to fetch tasks from each task list in parallel
      const taskPromises = taskLists
        .filter(taskList => taskList.id) // Filter out any lists without IDs
        .map(async (taskList) => {
          try {
            const tasksResponse = await tasks.tasks.list({
              tasklist: taskList.id!,
              ...params,
            });
            
            // Return both the tasks and the next page token
            return {
              tasks: tasksResponse.data.items || [],
              nextPageToken: tasksResponse.data.nextPageToken || null,
              success: true
            };
          } catch (error) {
            // Log the error but don't fail the entire operation
            console.error(`Error fetching tasks for list ${taskList.id}:`, error);
            return { tasks: [], nextPageToken: null, success: false };
          }
        });
      
      // Wait for all requests to complete
      const results = await Promise.all(taskPromises);
      
      // Combine the results
      let allTasks: tasks_v1.Schema$Task[] = [];
      let nextPageToken: string | null = null;
      
      for (const result of results) {
        if (result.success) {
          allTasks = allTasks.concat(result.tasks);
          
          // If any task list has a next page token, we'll return it
          // (This is a simplification; a more complex implementation would 
          // need to handle pagination across multiple task lists)
          if (result.nextPageToken) {
            nextPageToken = result.nextPageToken;
          }
        }
      }

      return [allTasks, nextPageToken];
    } catch (error) {
      handleApiError(error, "listing tasks");
    }
  }
}

export class TaskListActions {
  private static formatTaskList(taskList: tasks_v1.Schema$TaskList) {
    return `${taskList.title || 'Untitled'}\n ID: ${taskList.id} - Updated: ${taskList.updated || 'Unknown'} - ETag: ${taskList.etag}`;
  }

  private static formatTaskLists(taskLists: tasks_v1.Schema$TaskList[]) {
    return taskLists.map((taskList) => this.formatTaskList(taskList)).join("\n");
  }

  private static serializeTaskList(taskList: tasks_v1.Schema$TaskList) {
    return {
      id: taskList.id || null,
      title: taskList.title || 'Untitled',
      updated: taskList.updated || null,
      selfLink: taskList.selfLink || null,
      etag: taskList.etag || null,
    };
  }

  static async list(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    try {
      const response = await tasks.tasklists.list({
        maxResults: MAX_TASKLIST_RESULTS,
      });

      const taskLists = response.data.items || [];
      const formattedLists = this.formatTaskLists(taskLists);

      return {
        content: [
          {
            type: "text",
            text: `Found ${taskLists.length} task lists`,
          },
          {
            type: "resource",
            resource: {
              uri: "gtasklists:///list-results",
              mimeType: "application/json",
              text: JSON.stringify({
                count: taskLists.length,
                taskLists: taskLists.map(tl => this.serializeTaskList(tl))
              }, null, 2),
            }
          }
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to list task lists: ${error}`);
    }
  }

  static async get(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId = request.params.arguments?.id as string;

    if (!taskListId) {
      throw new McpError(ErrorCode.InvalidParams, "Task list ID is required");
    }

    try {
      const response = await tasks.tasklists.get({
        tasklist: taskListId,
      });

      return {
        content: [
          {
            type: "text",
            text: `Task list: ${response.data.title}`,
          },
          {
            type: "resource",
            resource: {
              uri: `gtasklists:///${taskListId}`,
              mimeType: "application/json",
              text: JSON.stringify(this.serializeTaskList(response.data), null, 2),
            }
          }
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get task list: ${error}`);
    }
  }

  static async create(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const title = request.params.arguments?.title as string;

    if (!title) {
      throw new McpError(ErrorCode.InvalidParams, "Task list title is required");
    }

    try {
      const response = await tasks.tasklists.insert({
        requestBody: {
          title: title,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Task list created: ${response.data.title}`,
          },
          {
            type: "resource",
            resource: {
              uri: `gtasklists:///${response.data.id}`,
              mimeType: "application/json",
              text: JSON.stringify(this.serializeTaskList(response.data), null, 2),
            }
          }
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to create task list: ${error}`);
    }
  }

  static async update(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId = request.params.arguments?.id as string;
    const title = request.params.arguments?.title as string;

    if (!taskListId) {
      throw new McpError(ErrorCode.InvalidParams, "Task list ID is required");
    }

    if (!title) {
      throw new McpError(ErrorCode.InvalidParams, "Task list title is required");
    }

    try {
      const response = await tasks.tasklists.update({
        tasklist: taskListId,
        requestBody: {
          title: title,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Task list updated: ${response.data.title}`,
          },
          {
            type: "resource",
            resource: {
              uri: `gtasklists:///${taskListId}`,
              mimeType: "application/json",
              text: JSON.stringify(this.serializeTaskList(response.data), null, 2),
            }
          }
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to update task list: ${error}`);
    }
  }

  static async delete(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId = request.params.arguments?.id as string;

    if (!taskListId) {
      throw new McpError(ErrorCode.InvalidParams, "Task list ID is required");
    }

    try {
      await tasks.tasklists.delete({
        tasklist: taskListId,
      });

      return {
        content: [
          {
            type: "text",
            text: `Task list ${taskListId} deleted successfully`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to delete task list: ${error}`);
    }
  }
}

export class TaskActions {
  private static formatTask(task: tasks_v1.Schema$Task) {
    return `${task.title || 'Untitled'}\n (Due: ${task.due || "Not set"}) - Notes: ${task.notes || 'None'} - ID: ${task.id} - Status: ${task.status} - Hidden: ${task.hidden || false} - Parent: ${task.parent || 'None'} - Deleted?: ${task.deleted || false} - Completed Date: ${task.completed || 'Not completed'} - Position: ${task.position} - Updated Date: ${task.updated} - ETag: ${task.etag}`;
  }

  private static formatTaskList(taskList: tasks_v1.Schema$Task[]) {
    return taskList.map((task) => this.formatTask(task)).join("\n");
  }

  private static serializeTask(task: tasks_v1.Schema$Task) {
    return {
      id: task.id || null,
      title: task.title || 'Untitled',
      status: task.status || 'needsAction',
      notes: task.notes || null,
      due: task.due || null,
      completed: task.completed || null,
      parent: task.parent || null,
      position: task.position || null,
      updated: task.updated || null,
      hidden: task.hidden || false,
      deleted: task.deleted || false,
      etag: task.etag || null,
      selfLink: task.selfLink || null,
      links: task.links || []
    };
  }

  private static async _list(tasks: tasks_v1.Tasks, taskListId?: string) {
    if (taskListId) {
      // If task list ID is provided, only fetch tasks from that list
      try {
        const tasksResponse = await tasks.tasks.list({
          tasklist: taskListId,
          maxResults: MAX_TASK_RESULTS,
        });

        return tasksResponse.data.items || [];
      } catch (error) {
        console.error(`Error fetching tasks for list ${taskListId}:`, error);
        return [];
      }
    }
    
    try {
      // Otherwise fetch tasks from all lists
      const taskListsResponse = await tasks.tasklists.list({
        maxResults: MAX_TASKLIST_RESULTS,
      });

      const taskLists = (taskListsResponse.data.items || [])
        .filter(taskList => taskList.id); // Filter out any lists without IDs
      
      if (taskLists.length === 0) {
        return [];
      }
      
      // Create an array of promises to fetch tasks from each task list in parallel
      const taskPromises = taskLists.map(async (taskList) => {
        try {
          const tasksResponse = await tasks.tasks.list({
            tasklist: taskList.id!,
            maxResults: MAX_TASK_RESULTS,
          });

          return tasksResponse.data.items || [];
        } catch (error) {
          console.error(`Error fetching tasks for list ${taskList.id}:`, error);
          return [];
        }
      });
      
      // Wait for all promises to resolve
      const results = await Promise.all(taskPromises);
      
      // Flatten the array of arrays into a single array of tasks
      return results.flat();
    } catch (error) {
      console.error('Error listing task lists:', error);
      return [];
    }
  }

  static async create(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const args = request.params.arguments || {};
    const params: TaskCreateParams = {
      title: (args.title as string) || '',
      taskListId: (args.taskListId as string) || undefined,
      notes: (args.notes as string) || undefined,
      due: (args.due as string) || undefined,
      status: (args.status as 'needsAction' | 'completed') || undefined,
      parent: (args.parent as string) || undefined
    };

    if (!params?.title) {
      throw new McpError(ErrorCode.InvalidParams, "Task title is required");
    }

    const taskListId = params.taskListId || "@default";

    // Construct task object with proper typing
    const task: tasks_v1.Schema$Task = {
      title: params.title,
    };

    if (params.notes) task.notes = params.notes;
    if (params.due) task.due = params.due;
    if (params.status) task.status = params.status;
    if (params.parent) task.parent = params.parent;

    try {
      const taskResponse = await tasks.tasks.insert({
        tasklist: taskListId,
        requestBody: task,
      });

      return {
        content: [
          {
            type: "text",
            text: `Task created: ${taskResponse.data.title}`,
          },
          {
            type: "resource",
            resource: {
              uri: `gtasks:///${taskResponse.data.id}`,
              mimeType: "application/json",
              text: JSON.stringify(this.serializeTask(taskResponse.data), null, 2),
            }
          }
        ],
      };
    } catch (error) {
      handleApiError(error, "creating task", ErrorCode.InternalError);
    }
  }

  static async update(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskId = request.params.arguments?.id as string;
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskStatus = request.params.arguments?.status as string;
    const taskDue = request.params.arguments?.due as string;
    const taskParent = request.params.arguments?.parent as string;

    if (!taskId) {
      throw new McpError(ErrorCode.InvalidParams, "Task ID is required");
    }

    const task: Partial<tasks_v1.Schema$Task> = {};
    if (taskTitle) task.title = taskTitle;
    if (taskNotes) task.notes = taskNotes;
    if (taskStatus) task.status = taskStatus;
    if (taskDue) task.due = taskDue;
    if (taskParent) task.parent = taskParent;

    try {
      const taskResponse = await tasks.tasks.patch({
        tasklist: taskListId,
        task: taskId,
        requestBody: task,
      });

      return {
        content: [
          {
            type: "text",
            text: `Task updated: ${taskResponse.data.title}`,
          },
          {
            type: "resource",
            resource: {
              uri: `gtasks:///${taskId}`,
              mimeType: "application/json",
              text: JSON.stringify(this.serializeTask(taskResponse.data), null, 2),
            }
          }
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to update task: ${error}`);
    }
  }

  static async list(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId = request.params.arguments?.taskListId as string;

    try {
      const allTasks = await this._list(tasks, taskListId);

      const listInfo = taskListId ? `in list ${taskListId}` : 'across all lists';

      return {
        content: [
          {
            type: "text",
            text: `Found ${allTasks.length} tasks ${listInfo}`,
          },
          {
            type: "resource",
            resource: {
              uri: taskListId ? `gtasks:///${taskListId}/tasks` : "gtasks:///all-tasks",
              mimeType: "application/json",
              text: JSON.stringify({
                count: allTasks.length,
                taskListId: taskListId || null,
                tasks: allTasks.map(t => this.serializeTask(t))
              }, null, 2),
            }
          }
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to list tasks: ${error}`);
    }
  }

  static async get(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId = (request.params.arguments?.taskListId as string) || "@default";
    const taskId = request.params.arguments?.id as string;

    if (!taskId) {
      throw new McpError(ErrorCode.InvalidParams, "Task ID is required");
    }

    try {
      const response = await tasks.tasks.get({
        tasklist: taskListId,
        task: taskId,
      });

      return {
        content: [
          {
            type: "text",
            text: `Task: ${response.data.title}`,
          },
          {
            type: "resource",
            resource: {
              uri: `gtasks:///${taskId}`,
              mimeType: "application/json",
              text: JSON.stringify(this.serializeTask(response.data), null, 2),
            }
          }
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get task: ${error}`);
    }
  }

  static async delete(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskId = request.params.arguments?.id as string;

    if (!taskId) {
      throw new McpError(ErrorCode.InvalidParams, "Task ID is required");
    }

    try {
      await tasks.tasks.delete({
        tasklist: taskListId,
        task: taskId,
      });

      return {
        content: [
          {
            type: "text",
            text: `Task ${taskId} deleted from list ${taskListId}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to delete task: ${error}`);
    }
  }

  static async search(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const userQuery = request.params.arguments?.query as string;
    const taskListId = request.params.arguments?.taskListId as string;

    if (!userQuery) {
      throw new McpError(ErrorCode.InvalidParams, "Search query is required");
    }

    try {
      const allTasks = await this._list(tasks, taskListId);
      const filteredItems = allTasks.filter(
        (task) =>
          task.title?.toLowerCase().includes(userQuery.toLowerCase()) ||
          task.notes?.toLowerCase().includes(userQuery.toLowerCase()),
      );

      const listInfo = taskListId ? `in list ${taskListId}` : 'across all lists';

      return {
        content: [
          {
            type: "text",
            text: `Found ${filteredItems.length} tasks matching "${userQuery}" ${listInfo}`,
          },
          {
            type: "resource",
            resource: {
              uri: `gtasks:///search?q=${encodeURIComponent(userQuery)}`,
              mimeType: "application/json",
              text: JSON.stringify({
                query: userQuery,
                count: filteredItems.length,
                taskListId: taskListId || null,
                tasks: filteredItems.map(t => this.serializeTask(t))
              }, null, 2),
            }
          }
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to search tasks: ${error}`);
    }
  }

  static async move(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId = (request.params.arguments?.taskListId as string) || "@default";
    const taskId = request.params.arguments?.id as string;
    const parentTaskId = request.params.arguments?.parent as string;
    const previousTaskId = request.params.arguments?.previous as string;

    if (!taskId) {
      throw new McpError(ErrorCode.InvalidParams, "Task ID is required");
    }

    try {
      const params: any = {
        tasklist: taskListId,
        task: taskId,
      };

      if (parentTaskId) {
        params.parent = parentTaskId;
      }

      if (previousTaskId) {
        params.previous = previousTaskId;
      }

      const response = await tasks.tasks.move(params);

      return {
        content: [
          {
            type: "text",
            text: `Task ${taskId} moved successfully`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to move task: ${error}`);
    }
  }

  static async clear(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";

    try {
      await tasks.tasks.clear({
        tasklist: taskListId,
      });

      return {
        content: [
          {
            type: "text",
            text: `Tasks from tasklist ${taskListId} cleared`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to clear tasks: ${error}`);
    }
  }
}
