export interface PlanTodo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface Plan {
  id: string;
  projectId: string;
  name: string;
  content: string;
  todos: PlanTodo[];
  createdAt: string;
  updatedAt: string;
}

const store = new Map<string, Plan>();

export function createPlan(
  projectId: string,
  name: string,
  content: string,
  todos?: PlanTodo[],
): Plan {
  const now = new Date().toISOString();
  const plan: Plan = {
    id: crypto.randomUUID(),
    projectId,
    name,
    content,
    todos: todos ?? [],
    createdAt: now,
    updatedAt: now,
  };
  store.set(plan.id, plan);
  return plan;
}

export function listPlans(projectId: string): Plan[] {
  const results: Plan[] = [];
  for (const plan of store.values()) {
    if (plan.projectId === projectId) results.push(plan);
  }
  results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return results;
}

export function getPlan(planId: string): Plan | null {
  return store.get(planId) ?? null;
}

export function updatePlan(
  planId: string,
  updates: Partial<Pick<Plan, 'name' | 'content' | 'todos'>>,
): Plan | null {
  const plan = store.get(planId);
  if (!plan) return null;

  if (updates.name !== undefined) plan.name = updates.name;
  if (updates.content !== undefined) plan.content = updates.content;
  if (updates.todos !== undefined) plan.todos = updates.todos;
  plan.updatedAt = new Date().toISOString();

  return plan;
}

export function deletePlan(planId: string): boolean {
  return store.delete(planId);
}

export function updatePlanTodo(
  planId: string,
  todoId: string,
  status: PlanTodo['status'],
): Plan | null {
  const plan = store.get(planId);
  if (!plan) return null;

  const todo = plan.todos.find((t) => t.id === todoId);
  if (!todo) return null;

  todo.status = status;
  plan.updatedAt = new Date().toISOString();
  return plan;
}
