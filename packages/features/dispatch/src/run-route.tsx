import { createSignal, type Accessor } from "solid-js";
import {
  Bot,
  Briefcase06Icon,
  FolderKanban,
  Gauge,
  GitBranch,
  Github,
  type ComposerSingleProperty,
  type PropertyOption,
} from "@polterware/frontend-design-system";
import { DispatchAgentAvatar } from "./agent-avatar";
import { dispatchBridge, mapDispatchAgents, mapDispatchModels, mapDispatchTiers } from "./dispatch-bridge";
import type { DispatchAgentView, DispatchModelView, DispatchTierView } from "./dispatch-types";

/** An open card a run can work on, listed under its stage and narrowed by its milestone. */
export type RunRouteCard = { slug: string; title: string; milestone?: string; stage?: string };

/** A repository a run can work in: its GitHub identity (github.com/owner/repo), if any. */
export type RunRouteRepository = { name: string; remote: string };

/**
 * What a run starts with: a tier, or one agent (and model), the card it works on, and the repository
 * it runs in (empty lets the core pick the card's component repository or the only one).
 */
export type RunRouteSelection = { tier: string; agent: string; model: string; cardSlug: string; repo?: string };

const DEFAULT_TIERS = ["easy", "normal", "hard"];
export const DEFAULT_RUN_TIER = "normal";

/**
 * Start run's Route, Milestone, Card, and Repository pills, shared by Runs' Start run and
 * Commander's Run an agent. Route is a tier (its table picks the agent and model, with fallbacks)
 * or one model, grouped by agent with their bots; Card shows once a milestone is picked; Repository
 * shows when the project has two or more.
 */
// Option icons are getters: an icon is a DOM node, and the pill and the list each need their own.
export function createRunRoute(options: {
  tiers: Accessor<readonly DispatchTierView[]>;
  agents: Accessor<readonly DispatchAgentView[]>;
  models: Accessor<readonly DispatchModelView[]>;
  cards: Accessor<readonly RunRouteCard[]>;
  repositories?: Accessor<readonly RunRouteRepository[]>;
}) {
  const [tier, setTier] = createSignal(DEFAULT_RUN_TIER);
  // "agent" or "agent<NUL>model"; empty lets the tier choose.
  const [agent, setAgent] = createSignal("");
  const [milestone, setMilestone] = createSignal("");
  const [card, setCardSlug] = createSignal("");
  const [repo, setRepo] = createSignal("");

  const setCard = (slug: string) => {
    setCardSlug(slug);
    const owner = options.cards().find((item) => item.slug === slug)?.milestone;
    if (owner) setMilestone(owner);
  };

  const properties = (): ComposerSingleProperty[] => {
    const avatar = (name: string) => <DispatchAgentAvatar agent={name} seed={name} size={18} />;
    const listed = new Set(options.models().map((model) => model.agent));
    const tierNames = [...new Set(options.tiers().map((item) => item.name))];
    const byTier: PropertyOption[] = (tierNames.length > 0 ? tierNames : DEFAULT_TIERS).map((name) => {
      const entries = options.tiers().filter((item) => item.name === name).sort((a, b) => a.position - b.position);
      const primary = entries[0];
      return {
        value: `tier:${name}`,
        label: name.charAt(0).toUpperCase() + name.slice(1),
        hint: primary ? `${primary.agent} / ${primary.model}${entries.length > 1 ? `, then ${entries.length - 1} fallback${entries.length === 2 ? "" : "s"}` : ""}` : "The tier table picks",
        group: "By tier",
        get icon() { return <Gauge size={14} />; },
      };
    });
    const routeOptions: PropertyOption[] = [
      ...byTier,
      ...options.models().map((model): PropertyOption => ({
        value: `${model.agent}\u0000${model.model}`,
        label: model.model,
        hint: [model.provider, model.tier].filter(Boolean).join(" / ") || undefined,
        group: model.agent,
        get icon() { return avatar(model.agent); },
        bareIcon: true,
      })),
      ...options.agents().filter((item) => !listed.has(item.name)).map((item): PropertyOption => ({
        value: item.name,
        label: item.name,
        hint: "Its default model",
        group: item.name,
        get icon() { return avatar(item.name); },
        bareIcon: true,
      })),
    ];
    const cards = options.cards();
    const milestones = [...new Set(cards.map((item) => item.milestone).filter((name): name is string => Boolean(name)))];
    const milestoneOptions: PropertyOption[] = [
      { value: "", label: "Any milestone", get icon() { return <Briefcase06Icon size={14} />; } },
      ...milestones.map((name): PropertyOption => {
        const count = cards.filter((item) => item.milestone === name).length;
        return { value: name, label: name, hint: `${count} open card${count === 1 ? "" : "s"}`, get icon() { return <Briefcase06Icon size={14} />; } };
      }),
    ];
    const cardOptions: PropertyOption[] = [
      { value: "", label: "No card", get icon() { return <FolderKanban size={14} />; } },
      ...cards.filter((item) => item.milestone === milestone()).map((item): PropertyOption => ({
        value: item.slug,
        label: item.title || item.slug,
        hint: item.slug,
        group: item.stage,
        get icon() { return <FolderKanban size={14} />; },
      })),
    ];
    const repositories = options.repositories?.() ?? [];
    const repositoryIcon = (remote: string) => remote ? <Github size={14} /> : <GitBranch size={14} />;
    const repositoryOptions: PropertyOption[] = [
      { value: "", label: "Card's repository", hint: "The card's component, or ask", get icon() { return <GitBranch size={14} />; } },
      ...repositories.map((item): PropertyOption => ({
        value: item.name,
        label: item.remote.startsWith("github.com/") ? item.remote.slice("github.com/".length) : item.name,
        hint: item.remote ? item.name : undefined,
        get icon() { return repositoryIcon(item.remote); },
      })),
    ];
    return [
      {
        id: "route",
        label: "Route",
        get icon() { return <Bot size={14} />; },
        options: routeOptions,
        value: agent() || `tier:${tier()}`,
        onChange: (value) => {
          if (value.startsWith("tier:")) {
            setTier(value.slice("tier:".length));
            setAgent("");
          } else setAgent(value);
        },
        pickerWidth: 340,
      },
      {
        id: "milestone",
        label: "Milestone",
        get icon() { return <Briefcase06Icon size={14} />; },
        options: milestoneOptions,
        value: milestone(),
        onChange: (value) => {
          setMilestone(value);
          // Card shows only under a milestone, and a card from another one no longer fits the pick.
          if (cards.find((item) => item.slug === card())?.milestone !== value) setCardSlug("");
        },
        pickerWidth: 280,
      },
      {
        id: "card",
        label: "Card",
        get icon() { return <FolderKanban size={14} />; },
        // Picking a milestone first keeps the card list short.
        hidden: !milestone(),
        options: cardOptions,
        value: card(),
        onChange: setCard,
        pickerWidth: 320,
      },
      {
        id: "repository",
        label: "Repository",
        get icon() { return <GitBranch size={14} />; },
        // With one repository (or none) the core needs no pick.
        hidden: repositories.length < 2,
        options: repositoryOptions,
        value: repo(),
        onChange: setRepo,
        pickerWidth: 280,
      },
    ];
  };

  const selection = (): RunRouteSelection => {
    const [picked = "", model = ""] = agent().split("\u0000");
    return { tier: tier(), agent: picked, model, cardSlug: card().trim(), ...(repo() ? { repo: repo() } : {}) };
  };

  return {
    properties,
    selection,
    /** Sets the card and the milestone that holds it. */
    setCard,
    /** Clears the card and the milestone, after a run started. */
    clearCard: () => { setCardSlug(""); setMilestone(""); },
  };
}

/** Tiers, agents, and the models the installed agents report, for a route picked outside Runs (Commander). */
export function createRunRouteSources() {
  const [tiers, setTiers] = createSignal<DispatchTierView[]>([]);
  const [agents, setAgents] = createSignal<DispatchAgentView[]>([]);
  const [models, setModels] = createSignal<DispatchModelView[]>([]);
  let loaded = false;
  /** Reads them once; a failure leaves the tiers' defaults and tries again next time. */
  const load = async () => {
    const bridge = dispatchBridge();
    if (loaded || !bridge) return;
    loaded = true;
    try {
      const [rawTiers, rawAgents, rawModels] = await Promise.all([
        bridge.listTiers({}),
        bridge.listAgents({}),
        bridge.listModels ? bridge.listModels({}) : Promise.resolve({ models: [] }),
      ]);
      setTiers(mapDispatchTiers(rawTiers));
      setAgents(mapDispatchAgents(rawAgents));
      setModels(mapDispatchModels(rawModels));
    } catch {
      loaded = false;
    }
  };
  return { tiers, agents, models, load };
}
