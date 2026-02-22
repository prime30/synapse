import { createClient } from "@/lib/supabase/server";

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
  sessionId: string | null;
  name: string;
  content: string;
  status: "draft" | "active" | "archived";
  version: number;
  todos: PlanTodo[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
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
    name: row.name,
    content: row.content,
    status: row.status as Plan["status"],
    version: row.version,
    todos: todoRows.map(mapTodoRow),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
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
  userId: string,
  name: string,
  content: string,
  todos?: { content: string; status?: PlanTodo["status"] }[],
  sessionId?: string,
): Promise<Plan> {
  const supabase = await createClient();

  const { data: planRow, error } = await supabase
    .from("plans")
    .insert({
      project_id: projectId,
      created_by: userId,
      updated_by: userId,
      name,
      content,
      ...(sessionId ? { session_id: sessionId } : {}),
    })
    .select("*")
    .single();

  if (error || !planRow) {
    throw new Error(`Failed to create plan: ${error?.message ?? "unknown"}`);
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
      throw new Error(`Failed to create todos: ${todoError.message}`);
    }
    todoRows = (data ?? []) as TodoRow[];
  }

  return mapPlanRow(planRow as PlanRow, todoRows);
}

export async function listPlans(projectId: string): Promise<Plan[]> {
  const supabase = await createClient();

  const { data: planRows, error } = await supabase
    .from("plans")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error || !planRows) return [];

  const planIds = planRows.map((p) => p.id);
  if (planIds.length === 0) return [];

  const { data: allTodos } = await supabase
    .from("plan_todos")
    .select("*")
    .in("plan_id", planIds)
    .order("sort_order", { ascending: true });

  const todosByPlan = new Map<string, TodoRow[]>();
  for (const todo of (allTodos ?? []) as TodoRow[]) {
    const list = todosByPlan.get(todo.plan_id) ?? [];
    list.push(todo);
    todosByPlan.set(todo.plan_id, list);
  }

  return planRows.map((row) =>
    mapPlanRow(row as PlanRow, todosByPlan.get(row.id) ?? []),
  );
}

export async function getPlan(planId: string): Promise<Plan | null> {
  return fetchPlanWithTodos(planId);
}

export async function updatePlan(
  planId: string,
  userId: string,
  updates: { name?: string; content?: string; status?: Plan["status"] },
  expectedVersion: number,
): Promise<Plan | { conflict: true; currentVersion: number }> {
  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = {
    updated_by: userId,
    version: expectedVersion + 1,
  };
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.content !== undefined) updatePayload.content = updates.content;
  if (updates.status !== undefined) {
    updatePayload.status = updates.status;
    if (updates.status === "archived") {
      updatePayload.archived_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase
    .from("plans")
    .update(updatePayload)
    .eq("id", planId)
    .eq("version", expectedVersion)
    .select("*");

  if (error) {
    throw new Error(`Failed to update plan: ${error.message}`);
  }

  if (!data || data.length === 0) {
    const { data: current } = await supabase
      .from("plans")
      .select("version")
      .eq("id", planId)
      .single();

    return { conflict: true, currentVersion: current?.version ?? -1 };
  }

  const { data: todoRows } = await supabase
    .from("plan_todos")
    .select("*")
    .eq("plan_id", planId)
    .order("sort_order", { ascending: true });

  return mapPlanRow(data[0] as PlanRow, (todoRows ?? []) as TodoRow[]);
}

export async function deletePlan(planId: string): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase.from("plans").delete().eq("id", planId);

  return !error;
}

export async function updatePlanTodo(
  planId: string,
  todoId: string,
  userId: string,
  status: PlanTodo["status"],
): Promise<Plan | null> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("plan_todos")
    .update({ status })
    .eq("id", todoId)
    .eq("plan_id", planId);

  if (error) return null;

  // Touch the parent plan's updated_by
  await supabase
    .from("plans")
    .update({ updated_by: userId })
    .eq("id", planId);

  return fetchPlanWithTodos(planId);
}

export async function addPlanTodo(
  planId: string,
  userId: string,
  content: string,
): Promise<Plan | null> {
  const supabase = await createClient();

  // Determine next sort_order
  const { data: maxRow } = await supabase
    .from("plan_todos")
    .select("sort_order")
    .eq("plan_id", planId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextOrder = maxRow ? maxRow.sort_order + 1 : 0;

  const { error } = await supabase.from("plan_todos").insert({
    plan_id: planId,
    content,
    sort_order: nextOrder,
  });

  if (error) return null;

  await supabase
    .from("plans")
    .update({ updated_by: userId })
    .eq("id", planId);

  return fetchPlanWithTodos(planId);
}

export async function removePlanTodo(
  planId: string,
  todoId: string,
): Promise<Plan | null> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("plan_todos")
    .delete()
    .eq("id", todoId)
    .eq("plan_id", planId);

  if (error) return null;

  return fetchPlanWithTodos(planId);
}

export async function readPlanForAgent(planId: string): Promise<string> {
  const plan = await fetchPlanWithTodos(planId);
  if (!plan) return "";

  const lines: string[] = [
    `[Plan: "${plan.name}" (${plan.status})]`,
    plan.content,
  ];

  if (plan.todos.length > 0) {
    lines.push("");
    lines.push("Todos:");
    for (const todo of plan.todos) {
      const check = todo.status === "completed" ? "x" : " ";
      lines.push(`- [${check}] ${todo.content}`);
    }
  }

  lines.push("[End Plan]");
  return lines.join("\n");
}
