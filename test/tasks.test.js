import { describe, it, beforeEach, afterEach, mock, expect } from 'node:test';
import { TaskActions, TaskResources } from '../dist/Tasks.js';

// Mock the Google Tasks API client
const mockTasksClient = {
  tasks: {
    list: mock.fn(),
    get: mock.fn(),
    insert: mock.fn(),
    update: mock.fn(),
    patch: mock.fn(),
    delete: mock.fn(),
    clear: mock.fn(),
    move: mock.fn()
  },
  tasklists: {
    list: mock.fn(),
    get: mock.fn(),
    insert: mock.fn(),
    update: mock.fn(),
    delete: mock.fn()
  }
};

describe('Task Operations', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mock.reset();
  });

  describe('TaskActions.list', () => {
    it('should list tasks from a specific task list', async () => {
      // Setup mock response
      mockTasksClient.tasklists.list.mock.mockImplementation(() => {
        return {
          data: {
            items: [
              { id: 'list1', title: 'Task List 1' }
            ]
          }
        };
      });
      
      mockTasksClient.tasks.list.mock.mockImplementation(() => {
        return {
          data: {
            items: [
              { id: 'task1', title: 'Task 1', status: 'needsAction' },
              { id: 'task2', title: 'Task 2', status: 'completed' }
            ]
          }
        };
      });
      
      // Call the method under test
      const request = {
        params: {
          arguments: {
            taskListId: 'list1'
          }
        }
      };
      
      const result = await TaskActions.list(request, mockTasksClient);
      
      // Verify the correct API calls were made
      expect(mockTasksClient.tasks.list.mock.calls.length).toBe(1);
      expect(mockTasksClient.tasks.list.mock.calls[0].arguments[0].tasklist).toBe('list1');
      
      // Verify the result format
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Found 2 tasks');
    });
  });

  describe('TaskActions.create', () => {
    it('should create a new task', async () => {
      // Setup mock response
      mockTasksClient.tasks.insert.mock.mockImplementation(() => {
        return {
          data: {
            id: 'newtask',
            title: 'New Task'
          }
        };
      });
      
      // Call the method under test
      const request = {
        params: {
          arguments: {
            title: 'New Task',
            notes: 'Task notes',
            taskListId: 'list1'
          }
        }
      };
      
      const result = await TaskActions.create(request, mockTasksClient);
      
      // Verify the correct API calls were made
      expect(mockTasksClient.tasks.insert.mock.calls.length).toBe(1);
      expect(mockTasksClient.tasks.insert.mock.calls[0].arguments[0].tasklist).toBe('list1');
      expect(mockTasksClient.tasks.insert.mock.calls[0].arguments[0].requestBody.title).toBe('New Task');
      expect(mockTasksClient.tasks.insert.mock.calls[0].arguments[0].requestBody.notes).toBe('Task notes');
      
      // Verify the result format
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Task created');
    });
  });

  // Additional tests for other operations would go here
});