import {
  CallToolRequest,
  ListResourcesRequest,
  ReadResourceRequest,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { GaxiosResponse } from "gaxios";
import { google, tasks_v1 } from "googleapis";

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
      console.error("Error listing task lists:", error);
      throw new McpError(ErrorCode.InternalError, `Failed to list task lists: ${error}`);
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
      console.error("Error reading task list:", error);
      throw new McpError(ErrorCode.InvalidRequest, `Task list not found: ${error}`);
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
        throw new McpError(ErrorCode.InvalidRequest, `Task not found: ${error}`);
      }
    }

    // Otherwise search in all task lists
    const taskListsResponse: GaxiosResponse<tasks_v1.Schema$TaskLists> =
      await tasks.tasklists.list({
        maxResults: MAX_TASKLIST_RESULTS,
      });

    const taskLists = taskListsResponse.data.items || [];
    let task: tasks_v1.Schema$Task | null = null;

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
          // Task not found in this list, continue to the next one
        }
      }
    }

    if (!task) {
      throw new McpError(ErrorCode.InvalidRequest, "Task not found");
    }

    return task;
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

    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];

    let allTasks: tasks_v1.Schema$Task[] = [];
    let nextPageToken: string | null = null;

    for (const taskList of taskLists) {
      if (!taskList.id) continue;
      
      try {
        const tasksResponse = await tasks.tasks.list({
          tasklist: taskList.id,
          ...params,
        });

        const taskItems = tasksResponse.data.items || [];
        allTasks = allTasks.concat(taskItems);

        if (tasksResponse.data.nextPageToken) {
          nextPageToken = tasksResponse.data.nextPageToken;
        }
      } catch (error) {
        console.error(`Error fetching tasks for list ${taskList.id}:`, error);
      }
    }

    return [allTasks, nextPageToken];
  }
}

export class TaskListActions {
  private static formatTaskList(taskList: tasks_v1.Schema$TaskList) {
    return `${taskList.title || 'Untitled'}\n ID: ${taskList.id} - Updated: ${taskList.updated || 'Unknown'} - ETag: ${taskList.etag}`;
  }

  private static formatTaskLists(taskLists: tasks_v1.Schema$TaskList[]) {
    return taskLists.map((taskList) => this.formatTaskList(taskList)).join("\n");
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
            text: `Found ${taskLists.length} task lists:\n${formattedLists}`,
          },
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
            text: this.formatTaskList(response.data),
          },
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
    
    // Otherwise fetch tasks from all lists
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASKLIST_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];
    let allTasks: tasks_v1.Schema$Task[] = [];

    for (const taskList of taskLists) {
      if (taskList.id) {
        try {
          const tasksResponse = await tasks.tasks.list({
            tasklist: taskList.id,
            maxResults: MAX_TASK_RESULTS,
          });

          const items = tasksResponse.data.items || [];
          allTasks = allTasks.concat(items);
        } catch (error) {
          console.error(`Error fetching tasks for list ${taskList.id}:`, error);
        }
      }
    }
    return allTasks;
  }

  static async create(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskStatus = request.params.arguments?.status as string;
    const taskDue = request.params.arguments?.due as string;
    const taskParent = request.params.arguments?.parent as string;

    if (!taskTitle) {
      throw new McpError(ErrorCode.InvalidParams, "Task title is required");
    }

    const task: any = {
      title: taskTitle,
    };
    
    if (taskNotes) task.notes = taskNotes;
    if (taskDue) task.due = taskDue;
    if (taskStatus) task.status = taskStatus;
    if (taskParent) task.parent = taskParent;

    try {
      const taskResponse = await tasks.tasks.insert({
        tasklist: taskListId,
        requestBody: task,
      });

      return {
        content: [
          {
            type: "text",
            text: `Task created: ${taskResponse.data.title} in list ${taskListId}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to create task: ${error}`);
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

    const task: any = {};
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
            text: `Task updated: ${taskResponse.data.title} in list ${taskListId}`,
          },
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
      const taskList = this.formatTaskList(allTasks);
      
      const listInfo = taskListId ? `in list ${taskListId}` : 'across all lists';
      
      return {
        content: [
          {
            type: "text",
            text: `Found ${allTasks.length} tasks ${listInfo}:\n${taskList}`,
          },
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
            text: this.formatTask(response.data),
          },
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

      const taskList = this.formatTaskList(filteredItems);
      const listInfo = taskListId ? `in list ${taskListId}` : 'across all lists';

      return {
        content: [
          {
            type: "text",
            text: `Found ${filteredItems.length} tasks matching "${userQuery}" ${listInfo}:\n${taskList}`,
          },
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
