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

### Using with Claude Desktop

Claude Desktop can integrate with this MCP server to access Google Tasks directly. This integration allows you to manage your tasks through natural language conversations with Claude.

#### Benefits of Using Claude with Google Tasks

- **Natural Language Task Management**: Create, search, and organize tasks using everyday language
- **Contextual Understanding**: Claude understands what you mean when you say "tomorrow" or "next week" for due dates
- **Task Prioritization Assistance**: Ask Claude for help organizing and prioritizing your tasks
- **Intelligent Search**: Find tasks using context and meaning, not just exact keywords
- **Bulk Operations**: Ask Claude to help you create or modify multiple tasks at once
- **Scheduling Assistance**: Claude can suggest optimal due dates based on your existing tasks
- **Task Summarization**: Get concise summaries of your tasks across multiple lists
- **Daily Planning**: Ask Claude to help you plan your day based on your current tasks

#### Setup Instructions

Here's how to set up the integration:

1. **Start the Google Tasks MCP server**:
   ```bash
   pnpm start
   ```
   The server will run on standard input/output channels (stdio).

2. **Launch Claude Desktop with MCP server connection**:
   ```bash
   claude mcp --command "node /path/to/google-tasks-mcp-server/dist/index.js"
   ```
   Replace `/path/to/google-tasks-mcp-server` with the actual path to your installation.

3. **Alternative: Create a configuration file**:
   Create a file named `claude.yaml` in your home directory or project directory:
   ```yaml
   mcp:
     command: node /path/to/google-tasks-mcp-server/dist/index.js
   ```
   Then simply run `claude` to use the configured MCP server.

4. **Inside Claude Desktop**: 
   Once connected, Claude will have access to your Google Tasks through custom MCP resources and tools. You can ask Claude to:
   - "Show me my task lists"
   - "Create a new task called 'Complete project report'"
   - "Find all tasks related to meetings"
   - "Mark my 'Review documents' task as completed"

Claude will use the MCP server to access your Google Tasks data according to your requests.

### Example Conversations with Claude

Here are some example conversations you can have with Claude once connected:

**Listing Tasks**:
```
You: Show me all my tasks
Claude: I'll retrieve your tasks from Google Tasks.
[Claude uses task.list tool]
Here are your current tasks:
- Complete project documentation (Due: 2025-05-10)
- Schedule team meeting (Due: Not set)
- Review quarterly report (Due: 2025-05-15)
```

**Creating a Task**:
```
You: Create a new task called "Send follow-up email" due tomorrow at 3 PM
Claude: I'll create that task for you.
[Claude uses task.create tool]
I've created a new task:
Title: Send follow-up email
Due: 2025-05-06T15:00:00Z
Status: needsAction
```

**Searching Tasks**:
```
You: Find all tasks related to "meeting"
Claude: I'll search for tasks containing "meeting".
[Claude uses task.search tool]
I found 2 tasks related to "meeting":
- Schedule team meeting (Due: Not set)
- Prepare meeting agenda (Due: 2025-05-08)
```

**Managing Task Lists**:
```
You: Create a new task list called "Personal Projects"
Claude: I'll create that task list for you.
[Claude uses tasklist.create tool]
I've created a new task list named "Personal Projects".
Would you like me to add any tasks to this list?
```

### Advanced Usage Scenarios

Here are some advanced ways to use Claude with your Google Tasks:

#### Project Planning

```
You: I need to plan a website launch. Can you help me create tasks for it?
Claude: I'd be happy to help plan your website launch. Let me create a task list and relevant tasks.
[Claude uses tasklist.create and task.create tools]
I've created a new task list "Website Launch" with the following tasks:
1. Finalize website content (Due: 1 week from now)
2. Complete design review (Due: 10 days from now)
3. Run final QA tests (Due: 2 weeks from now)
4. Prepare marketing materials (Due: 2 weeks from now)
5. Configure analytics (Due: 3 days before launch)
6. Launch website (Due: 3 weeks from now)
Would you like me to add more specific tasks?
```

#### Task Organization and Prioritization

```
You: I have too many tasks. Can you help me prioritize them?
Claude: I'll help you organize and prioritize your tasks.
[Claude uses task.list tool]
Based on your current tasks, here's a suggested prioritization:

High Priority (Complete today):
- Submit quarterly report (Due: Today)
- Call client about project delay (Due: Today)

Medium Priority (Complete this week):
- Prepare presentation (Due: In 3 days)
- Review team metrics (Due: In 5 days)

Low Priority (Can be scheduled later):
- Research new tools (Due: Next week)
- Update documentation (Due: In 2 weeks)

Would you like me to update the due dates to reflect these priorities?
```

#### Regular Task Management

```
You: What tasks should I focus on today?
Claude: Let me check your tasks due today or overdue.
[Claude uses task.list and task.search tools]
Here are the tasks you should focus on today:

Due Today:
- Prepare client meeting agenda
- Submit expense report

Overdue:
- Follow up on pending approvals (Due yesterday)

Upcoming Soon:
- Project proposal draft (Due tomorrow)

Should I mark any of these as completed?
```

### Troubleshooting Claude Desktop Integration

If you encounter issues when connecting Claude Desktop to the Google Tasks MCP server:

1. **Authentication Problems**:
   - Ensure your `.env` file has the correct `CLIENT_ID`, `CLIENT_SECRET`, and `REDIRECT_URI`
   - Check that you have valid refresh tokens in `.env` or in `.credentials.json`
   - If needed, regenerate your tokens through the Google OAuth process

2. **Connection Issues**:
   - Verify the server is running with `pnpm start` before connecting Claude
   - Check that the path in your `claude mcp --command` is correct
   - If using a configuration file, ensure the YAML syntax is valid

3. **Command Not Found**:
   - Ensure Claude Desktop CLI is in your PATH
   - Try using the full path to the Claude executable

4. **MCP Protocol Errors**:
   - These typically appear if the server encounters an internal error
   - Check server logs for details about the specific error
   - Ensure you're using compatible versions of Claude Desktop and the MCP SDK

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
# Run all tests (this will first build the TypeScript code)
pnpm test

# Run tests in watch mode for development
pnpm test:watch
```

Before running tests for the first time, you'll need to make sure dependencies are installed:

```bash
pnpm install
```

The test suite includes:
- Authentication tests: Verify token refresh handling
- Task operation tests: Validate task API functionality
- Error handling tests: Ensure errors are properly handled

Tests are written in JavaScript and run against the compiled TypeScript code, ensuring that the production code works as expected. The tests are designed to work with mocked dependencies, so no real Google API calls are made during testing.

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