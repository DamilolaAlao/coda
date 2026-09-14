import { emptyAgentPanelModel } from "@t3tools/client-runtime/state/subagentRuntime";
import type { RuntimeSubagent } from "@t3tools/client-runtime/state/subagentRuntime";
import { describe, expect, it } from "vite-plus/test";
import {
  agentDisplayInitials,
  formatSpawnConversationLead,
  mentionableAgentsFromPanel,
  primaryThreadAgentMention,
  resolveSpawnConversationAgents,
  searchMentionableAgents,
  slugifyAgentHandle,
} from "./agentConversation";

function agent(
  overrides: Partial<RuntimeSubagent> & Pick<RuntimeSubagent, "id" | "title">,
): RuntimeSubagent {
  return {
    kind: "subagent",
    role: null,
    model: null,
    effort: null,
    status: "running",
    activationCount: 1,
    usage: null,
    progress: "Reading files",
    lastToolName: null,
    result: null,
    error: null,
    outputFile: null,
    parentAgentId: null,
    agentIndex: null,
    phaseIndex: null,
    phaseTitle: null,
    attempt: null,
    workflowName: null,
    phases: [],
    runHandles: null,
    recentActivity: [],
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("slugifyAgentHandle", () => {
  it("turns titles into slack-style handles", () => {
    expect(slugifyAgentHandle("Code Reviewer")).toBe("code-reviewer");
    expect(slugifyAgentHandle("  Claude  ")).toBe("claude");
  });
});

describe("agentDisplayInitials", () => {
  it("uses the first letters of up to two words", () => {
    expect(agentDisplayInitials("Code Reviewer")).toBe("CR");
    expect(agentDisplayInitials("planner")).toBe("P");
  });
});

describe("mentionableAgentsFromPanel", () => {
  it("dedupes colliding handles", () => {
    const model = {
      ...emptyAgentPanelModel(),
      directAgents: [
        agent({ id: "a", title: "Reviewer", role: "reviewer" }),
        agent({ id: "b", title: "Reviewer", role: "reviewer" }),
      ],
      hasAgents: true,
    };
    expect(mentionableAgentsFromPanel(model).map((entry) => entry.handle)).toEqual([
      "reviewer",
      "reviewer-2",
    ]);
  });
});

describe("searchMentionableAgents", () => {
  it("matches handle, title, or description", () => {
    const agents = [
      primaryThreadAgentMention("Claude"),
      { id: "r", handle: "reviewer", title: "Code Reviewer", description: "Working" },
    ];
    expect(searchMentionableAgents(agents, "@rev").map((entry) => entry.id)).toEqual(["r"]);
    expect(searchMentionableAgents(agents, "claude").map((entry) => entry.handle)).toEqual([
      "claude",
    ]);
  });
});

describe("resolveSpawnConversationAgents", () => {
  it("lists direct spawn members as conversation speakers", () => {
    const reviewer = agent({ id: "child-1", title: "Reviewer" });
    const tester = agent({ id: "child-2", title: "Tester", status: "completed", progress: null });
    const conversation = resolveSpawnConversationAgents({
      workflowId: null,
      agentTaskIds: ["child-1", "child-2"],
      model: {
        ...emptyAgentPanelModel(),
        directAgents: [reviewer, tester],
        hasAgents: true,
      },
    });
    expect(conversation.agentCount).toBe(2);
    expect(conversation.visibleAgents.map((entry) => entry.title)).toEqual(["Reviewer", "Tester"]);
    expect(conversation.live).toBe(true);
    expect(formatSpawnConversationLead(conversation.live, conversation.agentCount)).toBe(
      "2 agents in this turn",
    );
  });
});
