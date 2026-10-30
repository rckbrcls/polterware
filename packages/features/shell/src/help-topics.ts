import type { Component } from "solid-js";
import {
  Bot,
  FileText,
  FingerAccessIcon,
  GitCompare,
  GitPullRequest,
  History,
  Layers,
  type HugeiconsIconProps,
} from "@polterware/frontend-design-system";

export const HELP_GITHUB_URL = "https://github.com/polterware/polterware";

export type HelpTopicId =
  | "what-its-for"
  | "agents-context"
  | "commits-history"
  | "contribute";

export type TopicIcon = Component<Omit<HugeiconsIconProps, "icon">>;

export type HelpTopicBodyRow = {
  icon: TopicIcon;
  text: string;
};

export type HelpTopic = {
  id: HelpTopicId;
  label: string;
  title: string;
  icon: TopicIcon;
  body: readonly HelpTopicBodyRow[];
  externalLink?: {
    label: string;
    url: string;
  };
};

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "what-its-for",
    label: "What it's for",
    title: "What Polterware is for",
    icon: Bot,
    body: [
      {
        icon: Bot,
        text: "Polterware is Project Context & Change Intelligence for AI Coding. It gives every coding agent the same understanding of your project, with the Rules they must follow, and shows on each card the commits that delivered it.",
      },
      {
        icon: Layers,
        text: "Architecture and Knowledge are ways for people to inspect the project model. They are not the product category — the durable value is verifiable context for agents.",
      },
    ],
  },
  {
    id: "agents-context",
    label: "Agents & context",
    title: "Agents & context",
    icon: FingerAccessIcon,
    body: [
      {
        icon: FingerAccessIcon,
        text: "Under Agents → Access, connect coding agents through MCP so they read the same project model people see in the Desktop.",
      },
      {
        icon: FileText,
        text: "Decisions, Rules, and Docs live under Knowledge. Agents read the same model through the CLI and MCP — humans and agents work from one model, not a hidden agent-only view.",
      },
    ],
  },
  {
    id: "commits-history",
    label: "Commits & history",
    title: "Commits & history",
    icon: GitCompare,
    body: [
      {
        icon: GitCompare,
        text: "A card shows the commits that delivered its tasks: the ones an agent linked, and the ones whose subject cites a task as slug#T2, with a link to GitHub when the repository is there.",
      },
      {
        icon: History,
        text: "Agents → History is a unified trail of justified changes from people and agents — what changed, why, and the audit chain behind it.",
      },
    ],
  },
  {
    id: "contribute",
    label: "How to contribute",
    title: "How to contribute",
    icon: GitPullRequest,
    body: [
      {
        icon: GitPullRequest,
        text: "Polterware is open source. Issues, discussions, and pull requests are welcome on GitHub.",
      },
      {
        icon: FileText,
        text: "Start from the repository README for setup, contribution guidelines, and how to report problems.",
      },
    ],
    externalLink: {
      label: "Open on GitHub",
      url: HELP_GITHUB_URL,
    },
  },
];

export function helpTopicById(id: HelpTopicId | null): HelpTopic | undefined {
  if (!id) return undefined;
  return HELP_TOPICS.find((topic) => topic.id === id);
}
