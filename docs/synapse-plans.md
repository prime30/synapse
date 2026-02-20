# Using Plans in Synapse

Plans are project-scoped documents for organizing work. Each plan is a markdown document with an optional list of todos that track progress. Agents can reference the current plan and update todo statuses as they work.

## What is a plan?

A plan contains:

- **Name** -- a short title (max 200 characters)
- **Content** -- markdown body (instructions, context, acceptance criteria, etc.)
- **Todos** -- an ordered list of tasks, each with an id, description, and status

Todo statuses: `pending`, `in_progress`, `completed`.

## Creating a plan

```
POST /api/projects/{projectId}/plans
Content-Type: application/json

{
  "name": "Homepage redesign",
  "content": "Redesign the homepage hero section and featured collection grid.\n\n## Requirements\n- Full-width hero with video background\n- 3-column featured collection below the fold",
  "todos": [
    { "id": "1", "content": "Create hero section with video background", "status": "pending" },
    { "id": "2", "content": "Build featured collection grid", "status": "pending" },
    { "id": "3", "content": "Add mobile responsive styles", "status": "pending" }
  ]
}
```

Response:

```json
{
  "data": {
    "plan": {
      "id": "plan_abc123",
      "name": "Homepage redesign",
      "content": "...",
      "todos": [...],
      "createdAt": "2026-02-19T12:00:00Z",
      "updatedAt": "2026-02-19T12:00:00Z"
    }
  }
}
```

## Listing plans

```
GET /api/projects/{projectId}/plans
```

Returns a summary of each plan with todo progress:

```json
{
  "data": {
    "plans": [
      {
        "id": "plan_abc123",
        "name": "Homepage redesign",
        "todoProgress": { "completed": 1, "total": 3 },
        "createdAt": "2026-02-19T12:00:00Z",
        "updatedAt": "2026-02-19T14:30:00Z"
      }
    ]
  }
}
```

## Getting a single plan

```
GET /api/projects/{projectId}/plans/{planId}
```

Returns the full plan including content and all todos.

## Updating a plan

```
PUT /api/projects/{projectId}/plans/{planId}
Content-Type: application/json

{
  "name": "Homepage redesign v2",
  "content": "Updated requirements...",
  "todos": [
    { "id": "1", "content": "Create hero section with video background", "status": "completed" },
    { "id": "2", "content": "Build featured collection grid", "status": "in_progress" },
    { "id": "3", "content": "Add mobile responsive styles", "status": "pending" },
    { "id": "4", "content": "Performance audit", "status": "pending" }
  ]
}
```

All fields are optional -- send only what you want to change.

## Deleting a plan

```
DELETE /api/projects/{projectId}/plans/{planId}
```

Returns `{ "data": { "deleted": true } }`.

## Updating a single todo

To update just one todo's status without replacing the entire todos array:

```
PATCH /api/projects/{projectId}/plans/{planId}/todos/{todoId}
Content-Type: application/json

{
  "status": "completed"
}
```

This is the endpoint agents use most often -- marking a task `in_progress` when they start and `completed` when they finish.

## Agent workflow with plans

1. **Read the plan** -- the agent fetches the plan via `GET .../plans/{planId}` to understand the scope and requirements.
2. **Pick a todo** -- the agent selects the next `pending` todo and marks it `in_progress` via `PATCH .../todos/{todoId}`.
3. **Do the work** -- the agent implements the task (editing files, running commands, etc.).
4. **Mark complete** -- on success, the agent patches the todo to `completed`.
5. **Repeat** -- move to the next pending todo until the plan is done.

This gives you a live progress view in the Synapse UI as the agent works through the plan.

## API reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/projects/{projectId}/plans` | List all plans (summary with progress) |
| `POST` | `/api/projects/{projectId}/plans` | Create a new plan |
| `GET` | `/api/projects/{projectId}/plans/{planId}` | Get full plan details |
| `PUT` | `/api/projects/{projectId}/plans/{planId}` | Update plan (name, content, todos) |
| `DELETE` | `/api/projects/{projectId}/plans/{planId}` | Delete a plan |
| `PATCH` | `/api/projects/{projectId}/plans/{planId}/todos/{todoId}` | Update a single todo's status |
