import type { TaskRecord } from "@ultimate-system/contracts";

type PaperclipCompany = {
  id: string;
  name: string;
};

type PaperclipGoal = {
  id: string;
  title: string;
};

type PaperclipIssue = {
  id: string;
  identifier?: string | null;
};

type PaperclipIssueDocument = {
  id: string;
  key: string;
  title: string | null;
  format: "markdown";
  body: string;
  latestRevisionId: string | null;
};

export class PaperclipClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | null = null
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Paperclip request failed: ${response.status} ${path} ${text}`);
    }

    return await response.json() as T;
  }

  private async requestOptional<T>(path: string, init?: RequestInit): Promise<T | null> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        ...(init?.headers ?? {})
      }
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Paperclip request failed: ${response.status} ${path} ${text}`);
    }

    return await response.json() as T;
  }

  async health(): Promise<unknown> {
    return this.request("/api/health");
  }

  async ensureCompany(name: string, description: string, budgetMonthlyUsd: number): Promise<PaperclipCompany> {
    const companies = await this.request<PaperclipCompany[]>("/api/companies");
    const existing = companies.find((company) => company.name === name);
    if (existing) {
      return existing;
    }
    return this.request<PaperclipCompany>("/api/companies", {
      method: "POST",
      body: JSON.stringify({
        name,
        description,
        budgetMonthlyCents: Math.round(budgetMonthlyUsd * 100)
      })
    });
  }

  async ensureGoal(companyId: string, title: string, description: string): Promise<PaperclipGoal> {
    const goals = await this.request<PaperclipGoal[]>(`/api/companies/${companyId}/goals`);
    const existing = goals.find((goal) => goal.title === title);
    if (existing) {
      return existing;
    }
    return this.request<PaperclipGoal>(`/api/companies/${companyId}/goals`, {
      method: "POST",
      body: JSON.stringify({
        title,
        description,
        level: "team",
        status: "active"
      })
    });
  }

  async createIssue(companyId: string, goalId: string | null, task: TaskRecord): Promise<PaperclipIssue> {
    return this.request<PaperclipIssue>(`/api/companies/${companyId}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        goalId,
        status: "todo",
        priority: task.executionMode === "provider" ? "high" : "medium"
      })
    });
  }

  async updateIssueStatus(issueId: string, task: TaskRecord): Promise<void> {
    const status = task.approvalState === "rejected"
      ? "blocked"
      : task.status === "released"
      ? "done"
      : task.status === "failed"
        ? "blocked"
        : task.status === "running" || task.status === "dispatched"
          ? "in_progress"
          : task.status === "completed"
            ? "in_review"
            : "todo";

    await this.request(`/api/issues/${issueId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        description: task.description
      })
    });
  }

  async addIssueComment(issueId: string, body: string): Promise<void> {
    await this.request(`/api/issues/${issueId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body
      })
    });
  }

  async upsertIssueDocument(issueId: string, key: string, title: string, body: string, changeSummary?: string): Promise<void> {
    const existing = await this.requestOptional<PaperclipIssueDocument>(`/api/issues/${issueId}/documents/${key}`);
    await this.request(`/api/issues/${issueId}/documents/${key}`, {
      method: "PUT",
      body: JSON.stringify({
        title,
        format: "markdown",
        body,
        changeSummary: changeSummary ?? null,
        baseRevisionId: existing?.latestRevisionId ?? null
      })
    });
  }
}
