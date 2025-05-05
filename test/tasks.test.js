import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { TaskActions } from '../dist/Tasks.js';

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
      assert.equal(mockTasksClient.tasks.list.mock.calls.length, 1);
      assert.equal(mockTasksClient.tasks.list.mock.calls[0].arguments[0].tasklist, 'list1');
      
      // Verify the result format
      assert.equal(result.content[0].type, 'text');
      assert.ok(result.content[0].text.includes('Found 2 tasks'), 'Text should include "Found 2 tasks"');
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
      assert.equal(mockTasksClient.tasks.insert.mock.calls.length, 1);
      assert.equal(mockTasksClient.tasks.insert.mock.calls[0].arguments[0].tasklist, 'list1');
      assert.equal(mockTasksClient.tasks.insert.mock.calls[0].arguments[0].requestBody.title, 'New Task');
      assert.equal(mockTasksClient.tasks.insert.mock.calls[0].arguments[0].requestBody.notes, 'Task notes');
      
      // Verify the result format
      assert.equal(result.content[0].type, 'text');
      assert.ok(result.content[0].text.includes('Task created'), 'Text should include "Task created"');
    });
  });

  // Additional tests for other operations would go here
});