#!/usr/bin/env node
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

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { TaskResources, TaskActions, TaskListResources, TaskListActions } from "./Tasks.js";

dotenv.config();

const { OAuth2 } = google.auth;
const GOOGLE_TASKS_API_VERSION = "v1";

// Set path for credentials storage
const CREDENTIALS_PATH = path.join(process.cwd(), ".credentials.json");

class TasksServer {
  private server: Server;
  private oAuth2Client: any;
  private tasks: any;

  constructor() {
    this.server = new Server(
      {
        name: "google-tasks-mcp-server",
        version: "1.0.0",
        description: "MCP Server for Google Tasks API"
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.oAuth2Client = new OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      process.env.REDIRECT_URI
    );

    this.setupAuth();
    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupAuth(): void {
    // Set credentials from environment variables or saved credentials
    if (process.env.REFRESH_TOKEN) {
      console.log("Using credentials from environment variables");
      this.oAuth2Client.setCredentials({
        access_token: process.env.ACCESS_TOKEN,
        refresh_token: process.env.REFRESH_TOKEN,
      });
    } else if (fs.existsSync(CREDENTIALS_PATH)) {
      try {
        console.log("Using saved credentials from file");
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
        this.oAuth2Client.setCredentials(credentials);
      } catch (error) {
        console.error("Error loading credentials:", error);
        process.exit(1);
      }
    } else {
      console.error("No credentials found. Please set REFRESH_TOKEN in .env file or run auth flow.");
      process.exit(1);
    }

    // Set up token refresh handler
    this.setupTokenRefreshHandler();

    // Initialize the tasks client
    this.tasks = google.tasks({
      version: GOOGLE_TASKS_API_VERSION,
      auth: this.oAuth2Client,
    });
  }

  private setupTokenRefreshHandler(): void {
    // Add a listener for token refresh events
    this.oAuth2Client.on('tokens', (tokens: {access_token?: string, refresh_token?: string}) => {
      console.log('Token refreshed');
      
      // If we have new access token, update credentials
      if (tokens.access_token) {
        // Get current credentials
        const credentials = this.oAuth2Client.credentials || {};
        
        // Update with new tokens
        const updatedCredentials = {
          ...credentials,
          ...tokens
        };
        
        // Update OAuth client with new credentials
        this.oAuth2Client.setCredentials(updatedCredentials);
        
        // Save updated credentials to file
        if (fs.existsSync(CREDENTIALS_PATH)) {
          try {
            fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(updatedCredentials, null, 2));
            console.log('Updated credentials saved to file');
          } catch (error) {
            console.error('Error saving updated credentials:', error);
          }
        }
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    this.setupResourceHandlers();
    this.setupToolHandlers();
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      try {
        // Check the resource type from the URI pattern
        const uriPattern = (request.params?.uriPattern as string) || "";

        // Handle task lists resources
        if (uriPattern.startsWith("gtasklists:///")) {
          const [taskLists, nextPageToken] = await TaskListResources.list(request, this.tasks);
          return {
            resources: taskLists.map((taskList) => ({
              uri: `gtasklists:///${taskList.id}`,
              mimeType: "text/plain",
              name: taskList.title || "Untitled Task List",
              description: `Task list - Updated: ${taskList.updated || 'Unknown'}`,
            })),
            nextCursor: nextPageToken,
          };
        }

        // Handle tasks resources
        if (uriPattern.startsWith("gtasks:///")) {
          const [allTasks, nextPageToken] = await TaskResources.list(request, this.tasks);
          return {
            resources: allTasks.map((task) => ({
              uri: `gtasks:///${task.id}`,
              mimeType: "text/plain",
              name: task.title || "Untitled Task",
              description: task.notes || "No description",
            })),
            nextCursor: nextPageToken,
          };
        }

        // If no specific pattern provided, return both task lists and tasks
        const [taskLists, taskListsNextPageToken] = await TaskListResources.list(request, this.tasks);
        const [allTasks, tasksNextPageToken] = await TaskResources.list(request, this.tasks);

        return {
          resources: [
            ...taskLists.map((taskList) => ({
              uri: `gtasklists:///${taskList.id}`,
              mimeType: "text/plain",
              name: taskList.title || "Untitled Task List",
              description: `Task list - Updated: ${taskList.updated || 'Unknown'}`,
            })),
            ...allTasks.map((task) => ({
              uri: `gtasks:///${task.id}`,
              mimeType: "text/plain",
              name: task.title || "Untitled Task",
              description: task.notes || "No description",
            }))
          ],
          // Use either nextPageToken if available
          nextCursor: taskListsNextPageToken || tasksNextPageToken,
        };
      } catch (error) {
        console.error("Error listing resources:", error);
        throw new McpError(ErrorCode.InternalError, `Failed to list resources: ${error}`);
      }
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      try {
        // Handle task list resources
        if (request.params.uri.startsWith("gtasklists:///")) {
          const taskList = await TaskListResources.read(request, this.tasks);
          
          const taskListDetails = [
            `Title: ${taskList.title || "No title"}`,
            `ID: ${taskList.id || "Unknown"}`,
            `Updated: ${taskList.updated || "Unknown"}`,
            `ETag: ${taskList.etag || "Unknown"}`,
            `Self Link: ${taskList.selfLink || "Unknown"}`,
          ].join("\n");
          
          return {
            contents: [
              {
                uri: request.params.uri,
                mimeType: "text/plain",
                text: taskListDetails,
              },
            ],
          };
        }
        
        // Handle task resources
        if (request.params.uri.startsWith("gtasks:///")) {
          // Extract task ID from URI
          const taskId = request.params.uri.replace("gtasks:///", "");
          
          // Handle special case for default task list view
          if (taskId === "default" || request.params.uri === "tasks://default") {
            const response = await this.tasks.tasks.list({
              tasklist: "@default",
            });

            return {
              contents: [
                {
                  uri: request.params.uri,
                  mimeType: "application/json",
                  text: JSON.stringify(response.data.items, null, 2),
                },
              ],
            };
          }

          // Handle individual task view
          const task = await TaskResources.read(request, this.tasks);

          const taskDetails = [
            `Title: ${task.title || "No title"}`,
            `Status: ${task.status || "Unknown"}`,
            `Due: ${task.due || "Not set"}`,
            `Notes: ${task.notes || "No notes"}`,
            `Hidden: ${task.hidden || "Unknown"}`,
            `Parent: ${task.parent || "None"}`,
            `Deleted?: ${task.deleted || "No"}`,
            `Completed Date: ${task.completed || "Not completed"}`,
            `Position: ${task.position || "Unknown"}`,
            `Updated: ${task.updated || "Unknown"}`,
          ].join("\n");

          return {
            contents: [
              {
                uri: request.params.uri,
                mimeType: "text/plain",
                text: taskDetails,
              },
            ],
          };
        }
        
        throw new McpError(ErrorCode.InvalidRequest, `Unsupported resource URI: ${request.params.uri}`);
      } catch (error) {
        console.error("Error reading resource:", error);
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Failed to read resource: ${error}`);
      }
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Task List Management Tools
        {
          name: "tasklist.list",
          description: "List all task lists in Google Tasks",
          inputSchema: {
            type: "object",
            properties: {
              maxResults: {
                type: "number",
                description: "Maximum number of task lists to return",
              },
            },
          },
        },
        {
          name: "tasklist.get",
          description: "Get a task list by ID",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task list ID",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "tasklist.create",
          description: "Create a new task list",
          inputSchema: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Title of the task list",
              },
            },
            required: ["title"],
          },
        },
        {
          name: "tasklist.update",
          description: "Update a task list",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task list ID",
              },
              title: {
                type: "string",
                description: "New title for the task list",
              },
            },
            required: ["id", "title"],
          },
        },
        {
          name: "tasklist.delete",
          description: "Delete a task list",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task list ID",
              },
            },
            required: ["id"],
          },
        },
        
        // Task Management Tools
        {
          name: "task.search",
          description: "Search for tasks in Google Tasks by title or notes",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query",
              },
              taskListId: {
                type: "string",
                description: "Optional task list ID to restrict search to",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "task.list",
          description: "List all tasks in Google Tasks",
          inputSchema: {
            type: "object",
            properties: {
              taskListId: {
                type: "string",
                description: "Optional task list ID to list tasks from",
              },
              cursor: {
                type: "string",
                description: "Cursor for pagination",
              },
            },
          },
        },
        {
          name: "task.get",
          description: "Get a task by ID",
          inputSchema: {
            type: "object",
            properties: {
              taskListId: {
                type: "string",
                description: "Task list ID, defaults to @default",
              },
              id: {
                type: "string",
                description: "Task ID",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "task.create",
          description: "Create a new task in Google Tasks",
          inputSchema: {
            type: "object",
            properties: {
              taskListId: {
                type: "string",
                description: "Task list ID, defaults to @default",
              },
              title: {
                type: "string",
                description: "Task title",
              },
              notes: {
                type: "string",
                description: "Task notes",
              },
              due: {
                type: "string",
                description: "Due date in RFC 3339 format",
              },
              status: {
                type: "string",
                enum: ["needsAction", "completed"],
                description: "Task status",
              },
              parent: {
                type: "string",
                description: "Parent task ID, for creating subtasks",
              },
            },
            required: ["title"],
          },
        },
        {
          name: "task.update",
          description: "Update a task in Google Tasks",
          inputSchema: {
            type: "object",
            properties: {
              taskListId: {
                type: "string",
                description: "Task list ID, defaults to @default",
              },
              id: {
                type: "string",
                description: "Task ID",
              },
              title: {
                type: "string",
                description: "Task title",
              },
              notes: {
                type: "string",
                description: "Task notes",
              },
              status: {
                type: "string",
                enum: ["needsAction", "completed"],
                description: "Task status (needsAction or completed)",
              },
              due: {
                type: "string",
                description: "Due date in RFC 3339 format",
              },
              parent: {
                type: "string",
                description: "Parent task ID",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "task.move",
          description: "Move a task in Google Tasks, changing its parent or position",
          inputSchema: {
            type: "object",
            properties: {
              taskListId: {
                type: "string",
                description: "Task list ID, defaults to @default",
              },
              id: {
                type: "string",
                description: "Task ID",
              },
              parent: {
                type: "string",
                description: "Parent task ID",
              },
              previous: {
                type: "string",
                description: "Previous sibling task ID",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "task.delete",
          description: "Delete a task in Google Tasks",
          inputSchema: {
            type: "object",
            properties: {
              taskListId: {
                type: "string",
                description: "Task list ID, defaults to @default",
              },
              id: {
                type: "string",
                description: "Task ID",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "task.clear",
          description: "Clear completed tasks from a Google Tasks task list",
          inputSchema: {
            type: "object",
            properties: {
              taskListId: {
                type: "string",
                description: "Task list ID, defaults to @default",
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        // Handle Task List operations
        if (request.params.name.startsWith("tasklist.")) {
          const operation = request.params.name.split(".")[1];
          switch (operation) {
            case "list":
              return await TaskListActions.list(request, this.tasks);
            case "get":
              return await TaskListActions.get(request, this.tasks);
            case "create":
              return await TaskListActions.create(request, this.tasks);
            case "update":
              return await TaskListActions.update(request, this.tasks);
            case "delete":
              return await TaskListActions.delete(request, this.tasks);
            default:
              throw new McpError(
                ErrorCode.MethodNotFound,
                `Unknown task list operation: ${operation}`
              );
          }
        }
        
        // Handle Task operations
        if (request.params.name.startsWith("task.")) {
          const operation = request.params.name.split(".")[1];
          switch (operation) {
            case "search":
              return await TaskActions.search(request, this.tasks);
            case "list":
              return await TaskActions.list(request, this.tasks);
            case "get":
              return await TaskActions.get(request, this.tasks);
            case "create":
              return await TaskActions.create(request, this.tasks);
            case "update":
              return await TaskActions.update(request, this.tasks);
            case "move":
              return await TaskActions.move(request, this.tasks);
            case "delete":
              return await TaskActions.delete(request, this.tasks);
            case "clear":
              return await TaskActions.clear(request, this.tasks);
            default:
              throw new McpError(
                ErrorCode.MethodNotFound,
                `Unknown task operation: ${operation}`
              );
          }
        }

        // Handle backwards compatibility for now
        switch (request.params.name) {
          case "search":
            return await TaskActions.search(request, this.tasks);
          case "list":
            return await TaskActions.list(request, this.tasks);
          case "create":
            return await TaskActions.create(request, this.tasks);
          case "update":
            return await TaskActions.update(request, this.tasks);
          case "delete":
            return await TaskActions.delete(request, this.tasks);
          case "clear":
            return await TaskActions.clear(request, this.tasks);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        console.error(`Error executing ${request.params.name} tool:`, error);
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error}`);
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Google Tasks MCP server running on stdio");
  }
}

const server = new TasksServer();
server.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
