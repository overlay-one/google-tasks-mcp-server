# Google Tasks MCP Server

A Model Context Protocol (MCP) server for Google Tasks, allowing AI assistants to interact with Google Tasks through the MCP protocol.

## Features

- List all tasks
- Search for tasks by title or notes
- Create new tasks
- Update existing tasks
- Delete tasks
- Clear completed tasks
- View detailed task information

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

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the Google Tasks API.
3. Create OAuth 2.0 credentials for a web application.
4. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

5. Edit the `.env` file with your Google API credentials:

```
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
REDIRECT_URI=http://localhost:3000/oauth2callback
```

## Usage

### Starting the Server

```bash
pnpm start
```

### Available Commands

The server supports the following operations:

- **List Tasks**: Lists all tasks across all task lists
- **Search Tasks**: Searches for tasks by title or notes
- **Create Task**: Creates a new task
- **Update Task**: Updates an existing task
- **Delete Task**: Deletes a task
- **Clear Tasks**: Clears all completed tasks from a task list

## API Reference

### Resources

- `gtasks:///default`: Lists all tasks
- `gtasks:///{taskId}`: Access a specific task by ID

### Tools

- `search`: Search for tasks by query
- `list`: List all tasks
- `create`: Create a new task
- `update`: Update an existing task
- `delete`: Delete a task
- `clear`: Clear completed tasks

## License

Apache-2.0
