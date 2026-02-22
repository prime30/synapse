import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PlanError extends Error {
  code?: string;
  constructor(
    message: string,
    public statusCode: number,
    code?: string,
  ) {
    super(message);
    this.name = "PlanError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface PlanTodo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  sortOrder: number;
  version: number;
}

export interface Plan {
  id: string;
  projectId: string;
  sessionId?: string | null;
  createdBy?: string;
  updatedBy?: string;
  name: string;
  content: string;
  status: "draft" | "active" | "archived";
  version: number;
  todos: PlanTodo[];
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanListItem {
  id: string;
  projectId: string;
  name: string;
  status: Plan["status"];
  todoProgress: { completed: number; total: number };
  createdAt: string;
  updatedAt: string;
}

export interface ConflictResult {
  conflict: true;
  currentVersion: number;
}

// ---------------------------------------------------------------------------
// Row → interface mappers
// ---------------------------------------------------------------------------

interface PlanRow {
  id: string;
  project_id: string;
  session_id: string | null;
  name: string;
  content: string;
  status: string;
  version: number;
  created_by: string;
  updated_by: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TodoRow {
  id: string;
  plan_id: string;
  content: string;
  status: string;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

function mapTodoRow(row: TodoRow): PlanTodo {
  return {
    id: row.id,
    content: row.content,
    status: row.status as PlanTodo["status"],
    sortOrder: row.sort_order,
    version: row.version,
  };
}

function mapPlanRow(row: PlanRow, todoRows: TodoRow[] = []): Plan {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    name: row.name,
    content: row.content,
    status: row.status as Plan["status"],
    version: row.version,
    todos: todoRows.map(mapTodoRow),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchPlanWithTodos(planId: string): Promise<Plan | null> {
  const supabase = await createClient();

  const { data: planRow, error } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .single();

  if (error || !planRow) return null;

  const { data: todoRows } = await supabase
    .from("plan_todos")
    .select("*")
    .eq("plan_id", planId)
    .order("sort_order", { ascending: true });

  return mapPlanRow(planRow as PlanRow, (todoRows ?? []) as TodoRow[]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createPlan(
  projectId: string,
  name: string,
  content: string,
  todos?: { content: string; status?: PlanTodo["status"] }[],
  userId?: string,
  sessionId?: string,
): Promise<Plan> {
  const supabase = await createClient();
  const actor = userId ?? "system";

  const { data: planRow, error } = await supabase
    .from("plans")
    .insert({
      project_id: projectId,
      created_by: actor,
      updated_by: actor,
      name,
      content,
      ...(sessionId ? { session_id: sessionId } : {}),
    })
    .select("*")
    .single();

  if (error || !planRow) {
    throw new PlanError(
      `Failed to create plan: ${error?.message ?? "unknown"}`,
      500,
    );
  }

  let todoRows: TodoRow[] = [];

  if (todos && todos.length > 0) {
    const todoInserts = todos.map((t, i) => ({
      plan_id: planRow.id,
      content: t.content,
      status: t.status ?? "pending",
      sort_order: i,
    }));

    const { data, error: todoError } = await supabase
      .from("plan_todos")
      .insert(todoInserts)
      .select("*")
      .order("sort_order", { ascending: true });

    if (todoError) {
      throw new PlanError(`Failed to create todos: ${todoError.message}`, 500);
    }
    todoRows = (data ?? []) as TodoRow[];
  }

  return mapPlanRow(planRow as PlanRow, todoRows);
}

export async function listPlans(projectId: string): Promise<PlanListItem[]> {
  const supabase = await createClient();

  const { data: planRows, error } = await supabase
    .from("plans")
    .select("id, project_id, name, status, created_at, updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error || !planRows) return [];

  const planIds = planRows.map((p) => p.id);
  if (planIds.length === 0) return [];

  const { data: allTodos } = await supabase
    .from("plan_todos")
    .select("plan_id, status")
    .in("plan_id", planIds);

  const progressByPlan = new Map<
    string,
    { completed: number; total: number }
  >();
  for (const todo of allTodos ?? []) {
    const entry = progressByPlan.get(todo.plan_id) ?? {
      completed: 0,
      total: 0,
    };
    entry.total++;
    if (todo.status === "completed") entry.completed++;
    progressByPlan.set(todo.plan_id, entry);
  }

  return planRows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    status: row.status as Plan["status"],
    todoProgress: progressByPlan.get(row.id) ?? { completed: 0, total: 0 },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getPlan(planId: string): Promise<Plan | null> {
  return fetchPlanWithTodos(planId);
}

export async function updatePlan(
  planId: string,
  updates: { name?: string; content?: string; status?: Plan["status"] },
  userId?: string,
  expectedVersion?: number,
): Promise<Plan | ConflictResult | null> {
  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = {
    updated_by: userId ?? "system",
  };
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.content !== undefined) updatePayload.content = updates.content;
  if (updates.status !== undefined) {
    updatePayload.status = updates.status;
    if (updates.status === "archived") {
      updatePayload.archived_at = new Date().toISOString();
    }
  }

  if (expectedVersion !== undefined) {
    updatePayload.version = expectedVersion + 1;

    const { data, error } = await supabase
      .from("plans")
      .update(updatePayload)
      .eq("id", planId)
      .eq("version", expectedVersion)
      .select("*");

    if (error) {
      throw new PlanError(`Failed to update plan: ${error.message}`, 500);
    }

    if (!data || data.length === 0) {
      const { data: current } = await supabase
        .from("plans")
        .select("version")
        .eq("id", planId)
        .single();

      if (!current) return null;
      return { conflict: true, currentVersion: current.version };
    }

    const { data: todoRows } = await supabase
      .from("plan_todos")
      .select("*")
      .eq("plan_id", planId)
      .order("sort_order", { ascending: true });

    return mapPlanRow(data[0] as PlanRow, (todoRows ?? []) as TodoRow[]);
  }

  const { data, error } = await supabase
    .from("plans")
    .update(updatePayload)
    .eq("id", planId)
    .select("*");

  if (error) {
    throw new PlanError(`Failed to update plan: ${error.message}`, 500);
  }

  if (!data || data.length === 0) return null;

  const { data: todoRows } = await supabase
    .from("plan_todos")
    .select("*")
    .eq("plan_id", planId)
    .order("sort_order", { ascending: true });

  return mapPlanRow(data[0] as PlanRow, (todoRows ?? []) as TodoRow[]);
}

export async function deletePlan(planId: string): Promise<boolean> {
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("plans")
    .delete({ count: "exact" })
    .eq("id", planId);

  if (error) {
    throw new PlanError(`Failed to delete plan: ${error.message}`, 500);
  }

  return (count ?? 0) > 0;
}

export async function updatePlanTodo(
  planId: string,
  todoId: string,
  status: PlanTodo["status"],
): Promise<Plan | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plan_todos")
    .update({ status })
    .eq("id", todoId)
    .eq("plan_id", planId)
    .select("*");

  if (error) {
    throw new PlanError(`Failed to update todo: ${error.message}`, 500);
  }

  if (!data || data.length === 0) return null;

  await supabase
    .from("plans")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", planId);

  return fetchPlanWithTodos(planId);
}

// ---------------------------------------------------------------------------
// Agent-facing read helper
// ---------------------------------------------------------------------------

export async function readPlanForAgent(planId: string): Promise<string | null> {
  const plan = await fetchPlanWithTodos(planId);
  if (!plan) return null;

  const lines: string[] = [
    `[Plan: "${plan.name}" (${plan.status}, v${plan.version})]`,
    plan.content,
  ];

  if (plan.todos.length > 0) {
    lines.push("");
    lines.push("Todos:");
    for (const todo of plan.todos) {
      if (todo.status === "completed") {
        lines.push(`- [x] ${todo.content}`);
      } else if (todo.status === "in_progress") {
        lines.push(`- [ ] ${todo.content} (in_progress)`);
      } else {
        lines.push(`- [ ] ${todo.content}`);
      }
    }
  }

  lines.push("[End Plan]");
  return lines.join("\n");
}
