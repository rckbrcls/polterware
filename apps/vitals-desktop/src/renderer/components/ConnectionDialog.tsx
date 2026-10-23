import { A11yDialog, Button, Field, FormStack, Input, Select, SettingsRow, Switch as ToggleSwitch } from "@polterware/frontend-design-system";
import { createSignal, Match, Show, Switch } from "solid-js";
import type { AuthMode, ConnectPayload, SavedServerPublic } from "../api";

export function savedConnectPayload(server: SavedServerPublic): ConnectPayload {
  return {
    serverId: server.id,
    label: server.label,
    host: server.host,
    port: server.port,
    username: server.username,
    authMode: server.authMode,
    privateKeyPath: server.privateKeyPath,
  };
}

export interface ConnectionDialogControls {
  openNew: () => void;
  openEdit: (server: SavedServerPublic) => void;
}

export function ConnectionDialog(props: {
  onConnect: (payload: ConnectPayload) => void;
  onRefreshSaved: () => void;
  bind: (controls: ConnectionDialogControls) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [label, setLabel] = createSignal("");
  const [host, setHost] = createSignal("");
  const [port, setPort] = createSignal(22);
  const [username, setUsername] = createSignal("root");
  const [authMode, setAuthMode] = createSignal<AuthMode>("password");
  const [password, setPassword] = createSignal("");
  const [privateKeyPath, setPrivateKeyPath] = createSignal("");
  const [passphrase, setPassphrase] = createSignal("");
  const [save, setSave] = createSignal(true);
  props.bind({ openNew: () => openNew(), openEdit: (server) => openEdit(server) });

  const canSubmit = () => host().trim().length > 0 && username().trim().length > 0;

  const reset = () => {
    setEditingId(null);
    setLabel("");
    setHost("");
    setPort(22);
    setUsername("root");
    setAuthMode("password");
    setPassword("");
    setPrivateKeyPath("");
    setPassphrase("");
    setSave(true);
  };

  const openNew = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (server: SavedServerPublic) => {
    setEditingId(server.id);
    setLabel(server.label);
    setHost(server.host);
    setPort(server.port);
    setUsername(server.username);
    setAuthMode(server.authMode);
    setPrivateKeyPath(server.privateKeyPath ?? "");
    setPassword("");
    setPassphrase("");
    setSave(true);
    setOpen(true);
  };

  const close = () => setOpen(false);

  const submit = () => {
    if (!canSubmit()) return;
    const mode = authMode();
    const editing = editingId();
    props.onConnect({
      serverId: editing ?? undefined,
      label: label() || host(),
      host: host(),
      port: port(),
      username: username(),
      authMode: mode,
      password: mode === "password" ? password() : undefined,
      privateKeyPath: mode === "privateKey" ? privateKeyPath() : undefined,
      privateKeyPassphrase: mode === "privateKey" ? passphrase() : undefined,
      save: editing ? true : save(),
    });
    props.onRefreshSaved();
    close();
  };

  return (
    <A11yDialog
      open={open()}
      size="sm"
      title={editingId() ? "Edit server" : "Connect"}
      onClose={close}
      footer={
        <>
          <Button variant="texture" textureTone="danger" onClick={close}>
            Cancel
          </Button>
          <Button variant="texture" textureTone="brand" disabled={!canSubmit()} onClick={submit}>
            Connect
          </Button>
        </>
      }
    >
      <FormStack>
        <Field label="Label" for="vitals-label">
          <Input id="vitals-label" value={label()} placeholder="prod-1" onInput={(event) => setLabel(event.currentTarget.value)} />
        </Field>
        <Field label="Host" for="vitals-host">
          <Input id="vitals-host" value={host()} required placeholder="192.168.1.10" onInput={(event) => setHost(event.currentTarget.value)} />
        </Field>
        <Field label="Port" for="vitals-port">
          <Input
            id="vitals-port"
            type="number"
            min={1}
            max={65535}
            value={port()}
            onInput={(event) => setPort(Number(event.currentTarget.value))}
          />
        </Field>
        <Field label="User" for="vitals-user">
          <Input id="vitals-user" value={username()} required onInput={(event) => setUsername(event.currentTarget.value)} />
        </Field>
        <Field label="Authentication">
          <Select
            aria-label="Authentication"
            value={authMode()}
            onChange={(value) => setAuthMode(value as AuthMode)}
            options={[
              { value: "password", label: "Password" },
              { value: "privateKey", label: "Private key" },
              { value: "agent", label: "SSH agent" },
            ]}
          />
        </Field>
        <Switch>
          <Match when={authMode() === "password"}>
            <Field label="Password" for="vitals-password">
              <Input id="vitals-password" type="password" value={password()} onInput={(event) => setPassword(event.currentTarget.value)} />
            </Field>
          </Match>
          <Match when={authMode() === "privateKey"}>
            <Field label="Private key path" for="vitals-key">
              <Input
                id="vitals-key"
                value={privateKeyPath()}
                placeholder="/Users/you/.ssh/id_ed25519"
                onInput={(event) => setPrivateKeyPath(event.currentTarget.value)}
              />
            </Field>
            <Field label="Passphrase (optional)" for="vitals-passphrase">
              <Input
                id="vitals-passphrase"
                type="password"
                value={passphrase()}
                onInput={(event) => setPassphrase(event.currentTarget.value)}
              />
            </Field>
          </Match>
        </Switch>
        <Show when={!editingId()}>
          <SettingsRow label="Save server">
            <ToggleSwitch
              checked={save()}
              onCheckedChange={setSave}
              aria-label="Save server"
            />
          </SettingsRow>
        </Show>
      </FormStack>
    </A11yDialog>
  );
}
