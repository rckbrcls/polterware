import {
  Button,
  ControlButton,
  Delete,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MoreHorizontal,
  PageEmpty,
  Pencil,
  Server,
} from "@polterware/frontend-design-system";
import { For, Show, createMemo } from "solid-js";
import type { SavedServerPublic } from "../api";

const RECENT_LIMIT = 4;

function HostRow(props: {
  server: SavedServerPublic;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div class="vitals-home-row">
      <Button variant="ghost" class="vitals-home-open" onClick={() => props.onOpen()}>
        <Server size={14} aria-hidden />
        <span class="vitals-home-label">{props.server.label}</span>
        <span class="vitals-home-host">
          {props.server.username}@{props.server.host}
        </span>
      </Button>
      <DropdownMenu positioning={{ placement: "bottom-end" }}>
        <DropdownMenuTrigger class="vitals-home-more" aria-label={`Actions for ${props.server.label}`}>
          <MoreHorizontal size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent class="min-w-40">
          <DropdownMenuItem value="edit" onSelect={() => props.onEdit()}>
            <Pencil size={14} aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem value="remove" danger onSelect={() => props.onRemove()}>
            <Delete size={14} aria-hidden />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Start screen: connect a new host, or reopen a recent or saved one. */
export function HostHome(props: {
  saved: SavedServerPublic[];
  recentKeys: string[];
  onOpen: (server: SavedServerPublic) => void;
  onEdit: (server: SavedServerPublic) => void;
  onRemove: (server: SavedServerPublic) => void;
  onNew: () => void;
}) {
  const recents = createMemo(() =>
    props.recentKeys
      .map((key) => props.saved.find((server) => serverKey(server) === key))
      .filter((server): server is SavedServerPublic => server !== undefined)
      .slice(0, RECENT_LIMIT),
  );
  const others = createMemo(() => props.saved.filter((server) => !recents().includes(server)));

  const section = (label: string, servers: () => SavedServerPublic[]) => (
    <Show when={servers().length > 0}>
      <section class="vitals-home-section" aria-label={label}>
        <p class="vitals-home-section-label">{label}</p>
        <For each={servers()}>
          {(server) => (
            <HostRow
              server={server}
              onOpen={() => props.onOpen(server)}
              onEdit={() => props.onEdit(server)}
              onRemove={() => props.onRemove(server)}
            />
          )}
        </For>
      </section>
    </Show>
  );

  return (
    <PageEmpty
      action={
        <div class="vitals-home">
          <ControlButton tone="secondary" class="vitals-home-connect" onClick={() => props.onNew()}>
            <Server size={16} />
            Connect a host
          </ControlButton>
          {section("Recents", recents)}
          {section("Saved", others)}
        </div>
      }
    />
  );
}

export function serverKey(server: Pick<SavedServerPublic, "username" | "host" | "port">): string {
  return `${server.username}@${server.host}:${server.port}`;
}
