import { createEffect, createMemo, createSignal, Show } from "solid-js";
import {
  A11yDialog,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@polterware/frontend-design-system";
import type { ComponentTypeDefinition } from "../domain/registry";
import {
  PLACE_ROLES,
  normalizePlaceConfig,
  type PlaceConfig,
} from "../domain/place-config";
import { placeHints } from "../domain/place-hints";
import { NodeIcon } from "../domain/node-icon";
import {
  DEFAULT_PROJECT_ENVIRONMENTS,
  defaultEnvironmentId,
  type ProjectEnvironment,
} from "../domain/project-environments";
import type { ResourceLinkPort } from "../domain/resource-link-port";
import { validateLink } from "../domain/place-link";
import { ResourceLinkPicker } from "./resource-link-picker";

export function ConfigureComponentDialog(props: {
  open: boolean;
  def: ComponentTypeDefinition | null;
  environments?: readonly ProjectEnvironment[];
  resourceLinkPort?: ResourceLinkPort;
  /** Prefill when resource-first Connected flow. */
  initial?: Partial<PlaceConfig> | null;
  onClose: () => void;
  onConfirm: (config: PlaceConfig) => void;
}) {
  const envs = createMemo(() =>
    props.environments && props.environments.length > 0
      ? props.environments
      : DEFAULT_PROJECT_ENVIRONMENTS,
  );

  const [name, setName] = createSignal("");
  const [environment, setEnvironment] = createSignal("production");
  const [purpose, setPurpose] = createSignal("");
  const [role, setRole] = createSignal("");
  const [owner, setOwner] = createSignal("");
  const [resourceId, setResourceId] = createSignal<string | undefined>();
  const [moreOpen, setMoreOpen] = createSignal(false);
  const [linkOpen, setLinkOpen] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const hints = createMemo(() => (props.def ? placeHints(props.def) : null));
  const componentType = createMemo(() =>
    props.def ? String(props.def.nodeType ?? props.def.id) : undefined,
  );

  createEffect(() => {
    if (props.open && props.def) {
      const init = props.initial;
      const envList = envs();
      setName(init?.name?.trim() || props.def.label);
      setEnvironment(
        init?.environmentId ||
          defaultEnvironmentId(envList) ||
          envList[0]?.id ||
          "production",
      );
      setPurpose(init?.description ?? "");
      setRole(init?.role ?? "");
      setOwner(init?.owner ?? "");
      setResourceId(init?.resourceId);
      setMoreOpen(false);
      setLinkOpen(Boolean(init?.resourceId));
      setError(null);
    }
  });

  function submit() {
    const result = normalizePlaceConfig(
      {
        name: name(),
        environmentId: environment(),
        description: purpose(),
        role: role(),
        owner: owner(),
        resourceId: resourceId(),
      },
      envs(),
    );
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (result.resourceId && props.resourceLinkPort) {
      const resource = props.resourceLinkPort.getById(result.resourceId);
      const link = validateLink(result.environmentId, resource);
      if ("error" in link) {
        setError(link.error ?? null);
        return;
      }
    }
    props.onConfirm(result);
  }

  return (
    <A11yDialog
      open={props.open && Boolean(props.def)}
      title="Configure component"
      description="Set component details before placing on the canvas."
      size="md"
      onClose={() => props.onClose()}
      footer={
        <>
          <Button type="button" variant="texture" size="sm" onClick={() => props.onClose()}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => submit()}>
            Place on canvas
          </Button>
        </>
      }
    >
      <Show when={props.def}>
        {(def) => (
          <div class="flex flex-col gap-5">
            <div class="flex items-start gap-3">
              <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]">
                <NodeIcon name={def().icon} subtype={def().subtype} size={20} />
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-[14px] font-medium text-[var(--color-text-primary)]">
                  {def().label}
                </div>
                <div class="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">
                  {hints()?.kindLabel}
                  <Show when={hints()?.typeBlurb}>
                    {(blurb) => (
                      <>
                        <span class="text-[var(--color-text-muted)]"> · </span>
                        {blurb()}
                      </>
                    )}
                  </Show>
                </div>
                <p class="m-0 mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                  {hints()?.statusLine}
                </p>
              </div>
            </div>

            <div class="flex flex-col gap-4">
              <Field
                label="Name"
                for="place-node-name"
                error={error() === "Name is required" ? error()! : undefined}
              >
                <Input
                  id="place-node-name"
                  size="md"
                  value={name()}
                  autofocus
                  autocomplete="off"
                  onInput={(e) => {
                    setName(e.currentTarget.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
              </Field>

              <Field
                label="Environment"
                for="place-node-env"
                error={
                  error() === "Environment is required" ||
                  error() === "Add a project environment first"
                    ? error()!
                    : undefined
                }
              >
                <Select
                  id="place-node-env"
                  size="md"
                  value={environment()}
                  options={envs().map((env) => ({
                    value: env.id,
                    label: env.label,
                  }))}
                  onChange={(value) => {
                    setEnvironment(value);
                    setResourceId(undefined);
                    setError(null);
                  }}
                />
              </Field>

              <Field
                label="Purpose"
                for="place-node-purpose"
                hint="What this instance does in our system — not the catalog type description."
              >
                <Textarea
                  id="place-node-purpose"
                  size="md"
                  rows={2}
                  value={purpose()}
                  placeholder={hints()?.purposePlaceholder}
                  onInput={(e) => {
                    setPurpose(e.currentTarget.value);
                    setError(null);
                  }}
                />
              </Field>
            </div>

            <div class="flex flex-col gap-3">
              <button
                type="button"
                class="flex w-full items-center gap-1.5 border-0 bg-transparent p-0 text-left text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                aria-expanded={moreOpen()}
                onClick={() => setMoreOpen((open) => !open)}
              >
                <span aria-hidden class="inline-block w-3 text-[var(--color-text-muted)]">
                  {moreOpen() ? "▾" : "▸"}
                </span>
                More context
                <span class="font-normal text-[var(--color-text-muted)]">(optional)</span>
              </button>

              <Show when={moreOpen()}>
                <div class="flex flex-col gap-4 pl-4">
                  <Field label="Role" for="place-node-role">
                    <Select
                      id="place-node-role"
                      size="md"
                      value={role()}
                      options={PLACE_ROLES.map((r) => ({
                        value: r.id,
                        label: r.label,
                      }))}
                      onChange={(value) => {
                        setRole(value);
                        setError(null);
                      }}
                    />
                  </Field>

                  <Field label="Owner" for="place-node-owner">
                    <Input
                      id="place-node-owner"
                      size="md"
                      value={owner()}
                      placeholder="Maintainer"
                      autocomplete="off"
                      onInput={(e) => {
                        setOwner(e.currentTarget.value);
                        setError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submit();
                        }
                      }}
                    />
                  </Field>
                </div>
              </Show>
            </div>

            <Show when={props.resourceLinkPort}>
              {(port) => (
                <div class="flex flex-col gap-3">
                  <button
                    type="button"
                    class="flex w-full items-center gap-1.5 border-0 bg-transparent p-0 text-left text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    aria-expanded={linkOpen()}
                    onClick={() => setLinkOpen((open) => !open)}
                  >
                    <span aria-hidden class="inline-block w-3 text-[var(--color-text-muted)]">
                      {linkOpen() ? "▾" : "▸"}
                    </span>
                    Link existing resource
                    <span class="font-normal text-[var(--color-text-muted)]">(optional)</span>
                  </button>
                  <Show when={linkOpen()}>
                    <div class="pl-4">
                      <ResourceLinkPicker
                        port={port()}
                        environmentId={environment()}
                        componentType={componentType()}
                        selectedId={resourceId()}
                        onSelect={(r) => {
                          setResourceId(r?.id);
                          setError(null);
                        }}
                      />
                    </div>
                  </Show>
                </div>
              )}
            </Show>

            <Show
              when={
                error() &&
                error() !== "Name is required" &&
                error() !== "Environment is required" &&
                error() !== "Add a project environment first"
              }
            >
              <p class="m-0 text-[12px] text-[var(--color-danger)]" role="alert">
                {error()}
              </p>
            </Show>
          </div>
        )}
      </Show>
    </A11yDialog>
  );
}
