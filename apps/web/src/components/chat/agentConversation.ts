import type {
  AgentPanelModel,
  RuntimeSubagent,
  RuntimeSubagentStatus,
} from "@t3tools/client-runtime/state/subagentRuntime";
import { isTerminalSubagentStatus } from "@t3tools/client-runtime/state/subagentRuntime";

export const SPAWN_CONVERSATION_VISIBLE_LIMIT = 6;
export const AGENT_MENTION_MENU_LIMIT = 8;

export type MentionableAgent = {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string;
};

const STATUS_LABEL: Record<RuntimeSubagentStatus, string> = {
  pending: "Working",
  running: "Working",
  waiting: "Working",
  idle: "Idle",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Stopped",
  interrupted: "Stopped",
};

export function slugifyAgentHandle(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 40) : "agent";
}

const AVATAR_TONES = [
  "bg-info/20 text-info-foreground",
  "bg-success/15 text-success",
  "bg-warning/20 text-warning",
  "bg-primary/15 text-primary",
] as const;

export function agentAvatarToneClass(id: string): string {
  let hash = 0;
  for (const char of id) {
    hash = (hash + char.charCodeAt(0)) % AVATAR_TONES.length;
  }
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0];
}

export function agentDisplayInitials(title: string): string {
  const parts = title
    .trim()
    .split(/[\s/_-]+/)
    .filter((part) => part.length > 0)
    .slice(0, 2);
  if (parts.length === 0) {
    return "A";
  }
  return parts.map((part) => part[0]!.toUpperCase()).join("");
}

export function formatAgentStatusLabel(status: RuntimeSubagentStatus): string {
  return STATUS_LABEL[status];
}

export function formatAgentConversationPreview(agent: RuntimeSubagent): string {
  const live =
    agent.status === "running" || agent.status === "pending" || agent.status === "waiting";
  if (live) {
    return (
      agent.progress ??
      (agent.lastToolName ? `Using ${agent.lastToolName}` : null) ??
      agent.result ??
      agent.error ??
      formatAgentStatusLabel(agent.status)
    );
  }
  return (
    agent.error ??
    agent.result ??
    agent.progress ??
    (agent.lastToolName ? `Used ${agent.lastToolName}` : null) ??
    formatAgentStatusLabel(agent.status)
  );
}

function workflowMembers(
  group: AgentPanelModel["workflows"][number],
): ReadonlyArray<RuntimeSubagent> {
  return [...group.phases.flatMap((phase) => phase.members), ...group.unphasedMembers];
}

export function flattenPanelAgents(model: AgentPanelModel): RuntimeSubagent[] {
  const seen = new Set<string>();
  const agents: RuntimeSubagent[] = [];
  const push = (agent: RuntimeSubagent) => {
    if (seen.has(agent.id)) {
      return;
    }
    seen.add(agent.id);
    agents.push(agent);
  };
  for (const group of model.workflows) {
    for (const member of workflowMembers(group)) {
      push(member);
    }
  }
  for (const agent of model.directAgents) {
    push(agent);
  }
  return agents;
}

function uniqueHandle(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let index = 2;
  while (used.has(`${base}-${index}`)) {
    index += 1;
  }
  const handle = `${base}-${index}`;
  used.add(handle);
  return handle;
}

export function primaryThreadAgentMention(providerLabel: string): MentionableAgent {
  const title = providerLabel.trim().length > 0 ? providerLabel.trim() : "Agent";
  return {
    id: `primary:${slugifyAgentHandle(title)}`,
    handle: slugifyAgentHandle(title),
    title,
    description: "Primary agent for this thread",
  };
}

export function mentionableAgentsFromPanel(model: AgentPanelModel): MentionableAgent[] {
  const used = new Set<string>();
  return flattenPanelAgents(model).map((agent) => {
    const handle = uniqueHandle(slugifyAgentHandle(agent.role ?? agent.title), used);
    const role =
      agent.role && agent.role.trim().toLocaleLowerCase() !== agent.title.trim().toLocaleLowerCase()
        ? agent.role
        : null;
    return {
      id: agent.id,
      handle,
      title: agent.title,
      description: role
        ? `${role} · ${formatAgentStatusLabel(agent.status)}`
        : formatAgentStatusLabel(agent.status),
    };
  });
}

export function searchMentionableAgents(
  agents: ReadonlyArray<MentionableAgent>,
  query: string,
): MentionableAgent[] {
  const normalized = query.trim().toLowerCase().replace(/^@+/, "");
  const matches = normalized
    ? agents.filter((agent) => {
        return (
          agent.handle.includes(normalized) ||
          agent.title.toLowerCase().includes(normalized) ||
          agent.description.toLowerCase().includes(normalized)
        );
      })
    : [...agents];
  return matches.slice(0, AGENT_MENTION_MENU_LIMIT);
}

export function formatSpawnConversationLead(live: boolean, agentCount: number): string {
  const noun = agentCount === 1 ? "agent" : "agents";
  return live ? `${agentCount} ${noun} in this turn` : `${agentCount} ${noun} ran`;
}

export function resolveSpawnConversationAgents(input: {
  readonly workflowId: string | null;
  readonly agentTaskIds: ReadonlyArray<string>;
  readonly model: AgentPanelModel;
}): {
  readonly agents: RuntimeSubagent[];
  readonly visibleAgents: RuntimeSubagent[];
  readonly hiddenCount: number;
  readonly agentCount: number;
  readonly workflowName: string | null;
  readonly live: boolean;
  readonly failed: number;
  readonly working: number;
} {
  const memberIds = new Set(input.agentTaskIds);
  const workflowGroup = input.workflowId
    ? input.model.workflows.find((group) => group.workflow.id === input.workflowId)
    : undefined;
  const agents = workflowGroup
    ? [...workflowMembers(workflowGroup)]
    : input.model.directAgents.filter((agent) => memberIds.has(agent.id));
  const agentCount = Math.max(
    agents.length,
    Math.max(memberIds.size - (input.workflowId ? 1 : 0), 0),
  );
  const running = agents.filter(
    (agent) => agent.status === "running" || agent.status === "pending",
  ).length;
  const waiting = agents.filter((agent) => agent.status === "waiting").length;
  const failed = agents.filter((agent) => agent.status === "failed").length;
  const coordinatorStatus = workflowGroup?.workflow.status;
  const coordinatorSettled =
    coordinatorStatus !== undefined && isTerminalSubagentStatus(coordinatorStatus);
  const live = workflowGroup !== undefined ? !coordinatorSettled : running + waiting > 0;
  const visibleAgents = agents.slice(0, SPAWN_CONVERSATION_VISIBLE_LIMIT);
  return {
    agents,
    visibleAgents,
    hiddenCount: Math.max(0, agents.length - visibleAgents.length),
    agentCount,
    workflowName: workflowGroup?.workflow.workflowName ?? workflowGroup?.workflow.title ?? null,
    live,
    failed,
    working: running + waiting,
  };
}
