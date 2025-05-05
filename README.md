# Google Tasks MCP Server

A Model Context Protocol (MCP) server for Google Tasks, allowing AI assistants to interact with Google Tasks through the MCP protocol.

## Features

- List, create, update, and delete task lists
- List, search, create, update, delete, and move tasks
- Task organization with parent-child relationships
- View detailed task information
- Clear completed tasks
- OAuth2 authentication with automatic token refresh
- Parallel API requests for improved performance
- TypeScript interfaces for type safety
- Comprehensive error handling
- Integration with AI assistants through MCP

## Installation

```bash
# Clone the repository
git clone https://github.com/overlay-one/google-tasks-mcp-server.git
cd google-tasks-mcp-server

# Install dependencies
pnpm install

# Build the project
pnpm build
```

## Configuration

### Setting up Google Cloud API Access

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the Google Tasks API:
   - Navigate to API Library
   - Search for "Tasks API"
   - Click "Enable"
3. Create OAuth 2.0 credentials:
   - Navigate to "Credentials"
   - Click "Create Credentials" and select "OAuth client ID"
   - Choose "Web application" as application type
   - Add your redirect URI (e.g., `http://localhost:3000/oauth2callback`)
   - After creation, note your Client ID and Client Secret

### Environment Configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Edit the `.env` file with your Google API credentials:

```
# Required credentials
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
REDIRECT_URI=http://localhost:3000/oauth2callback

# Optional tokens (if you already have them)
# ACCESS_TOKEN=your-access-token
# REFRESH_TOKEN=your-refresh-token

# Optional server configuration
# LOG_LEVEL=info     # Options: error, warn, info, debug
```

### Authentication Methods

The server supports two authentication methods:

1. **Environment Variables**: Set ACCESS_TOKEN and REFRESH_TOKEN in your .env file
2. **Credentials File**: The server can store tokens in a `.credentials.json` file

The server includes automatic token refresh handling. When access tokens expire, the server will:
1. Automatically use the refresh token to obtain a new access token
2. Update the credentials in memory
3. Save the updated tokens to `.credentials.json` (if using file-based storage)

## Usage

### Starting the Server

```bash
# Production mode
pnpm start

# Development mode (with auto-reloading)
pnpm dev
```

## API Reference

### Resources

The server provides resources through custom URI schemes:

#### Task List Resources

- `gtasklists:///`: Lists all task lists
- `gtasklists:///{taskListId}`: Access a specific task list by ID

#### Task Resources

- `gtasks:///`: Lists all tasks across all task lists
- `gtasks:///default`: Lists tasks in the default task list
- `gtasks:///{taskId}`: Access a specific task by ID
- `gtasks:///{taskListId}/tasks/{taskId}`: Access a specific task within a specific task list

### Tools

The server supports the following operations through MCP tools:

#### Task List Management

| Tool | Description | Required Parameters | Optional Parameters |
|------|-------------|---------------------|---------------------|
| `tasklist.list` | List all task lists | None | `maxResults` |
| `tasklist.get` | Get a task list by ID | `id` | None |
| `tasklist.create` | Create a new task list | `title` | None |
| `tasklist.update` | Update a task list | `id`, `title` | None |
| `tasklist.delete` | Delete a task list | `id` | None |

#### Task Management

| Tool | Description | Required Parameters | Optional Parameters |
|------|-------------|---------------------|---------------------|
| `task.search` | Search for tasks by title or notes | `query` | `taskListId` |
| `task.list` | List all tasks | None | `taskListId`, `cursor` |
| `task.get` | Get a task by ID | `id` | `taskListId` |
| `task.create` | Create a new task | `title` | `taskListId`, `notes`, `due`, `status`, `parent` |
| `task.update` | Update an existing task | `id` | `taskListId`, `title`, `notes`, `status`, `due`, `parent` |
| `task.move` | Move a task (change parent or position) | `id` | `taskListId`, `parent`, `previous` |
| `task.delete` | Delete a task | `id` | `taskListId` |
| `task.clear` | Clear completed tasks | None | `taskListId` |

### Example Operations

#### Creating a Task

```json
{
  "name": "task.create",
  "arguments": {
    "title": "Complete project documentation",
    "notes": "Include API reference and setup instructions",
    "due": "2025-05-10T00:00:00.000Z",
    "status": "needsAction"
  }
}
```

#### Searching for Tasks

```json
{
  "name": "task.search",
  "arguments": {
    "query": "documentation",
    "taskListId": "MTIzNDU2Nzg5MA"
  }
}
```

## Development

### Project Structure

- `src/index.ts`: Main server implementation and MCP protocol handlers
- `src/Tasks.ts`: Implementation of task and task list resources and actions
- `src/types.ts`: TypeScript interfaces for request/response handling
- `test/`: Unit tests for server components

### TypeScript Types

The project uses TypeScript interfaces for type safety. Key interfaces include:

- **Request Parameter Types**: TypeScript interfaces for all tool parameter types
  - `TaskCreateParams`, `TaskUpdateParams`, `TaskSearchParams`, etc.
- **Resource Types**: Interfaces for resource representations
  - `TaskResource`, `TaskListResource`
- **Utility Types**: Helper types for working with the Google Tasks API

These interfaces help ensure type safety when passing parameters to the Google Tasks API and handling responses.

### Error Handling

The server implements a consistent error handling system that:

1. Maps HTTP error codes to appropriate MCP error codes
2. Provides detailed error messages with operation context
3. Handles errors from parallel API calls appropriately

### Performance Optimization

The server uses parallel API calls for operations involving multiple task lists:

- In `TaskResources.list()` and `TaskActions._list()`, tasks from multiple lists are fetched in parallel
- Results are combined properly, even if some task list requests fail
- This significantly improves performance for users with many task lists

### Testing

The project includes a testing framework using Node.js built-in test runner:

```bash
# Run all tests
pnpm test

# Run tests in watch mode for development
pnpm test:watch
```

The test suite includes:
- Authentication tests: Verify token refresh handling
- Task operation tests: Validate task API functionality
- Error handling tests: Ensure errors are properly handled

### Building

```bash
pnpm build
```

### Running in Development Mode

```bash
pnpm dev
```

## License

Apache-2.0