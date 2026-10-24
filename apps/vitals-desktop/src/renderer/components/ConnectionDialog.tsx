import { A11yDialog, Button, Field, FormStack, Input, Select, SettingsRow, Switch as ToggleSwitch } from "@polterware/frontend-design-system";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import type { AuthMode, ConnectPayload, ConnectResult, SavedServerPublic } from "../api";

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
  /** Resolves once the session is connected or has failed; the form stays open until it succeeds. */
  onConnect: (payload: ConnectPayload) => Promise<ConnectResult>;
  onCancelConnect: () => void;
  progress: string;
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
  const [connecting, setConnecting] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<Partial<Record<"host" | "port" | "username" | "password" | "key", string>>>({});
  const [connectionErrors, setConnectionErrors] = createSignal<string[]>([]);
  let attempt = 0;
  props.bind({ openNew: () => openNew(), openEdit: (server) => openEdit(server) });

  const clearErrors = () => {
    setFieldErrors({});
    setConnectionErrors([]);
  };

  const reset = () => {
    attempt += 1;
    setConnecting(false);
    clearErrors();
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
    attempt += 1;
    setConnecting(false);
    clearErrors();
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

  const validate = () => {
    const errors: ReturnType<typeof fieldErrors> = {};
    if (host().trim().length === 0) errors.host = "Host is required";
    if (username().trim().length === 0) errors.username = "User is required";
    if (!Number.isInteger(port()) || port() < 1 || port() > 65535) errors.port = "Port must be between 1 and 65535";
    if (authMode() === "password" && password().length === 0) errors.password = "Password is required";
    if (authMode() === "privateKey" && privateKeyPath().trim().length === 0) errors.key = "Private key path is required";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const close = () => setOpen(false);

  const cancel = () => {
    if (connecting()) {
      attempt += 1;
      props.onCancelConnect();
      setConnecting(false);
      return;
    }
    close();
  };

  const submit = async () => {
    if (connecting()) return;
    setConnectionErrors([]);
    if (!validate()) return;
    const mode = authMode();
    const editing = editingId();
    const current = ++attempt;
    setConnecting(true);
    const result = await props.onConnect({
      serverId: editing ?? undefined,
      label: label() || host(),
      host: host().trim(),
      port: port(),
      username: username().trim(),
      authMode: mode,
      password: mode === "password" ? password() : undefined,
      privateKeyPath: mode === "privateKey" ? privateKeyPath() : undefined,
      privateKeyPassphrase: mode === "privateKey" ? passphrase() : undefined,
      save: editing ? true : save(),
    });
    if (current !== attempt) return;
    setConnecting(false);
    if (result.ok) {
      props.onRefreshSaved();
      close();
    } else {
      setConnectionErrors(result.errors);
    }
  };

  const edit = (setter: (value: string) => void, field?: keyof ReturnType<typeof fieldErrors>) => (event: { currentTarget: HTMLInputElement }) => {
    setter(event.currentTarget.value);
    setConnectionErrors([]);
    if (field && fieldErrors()[field]) setFieldErrors({ ...fieldErrors(), [field]: undefined });
  };

  return (
    <A11yDialog
      open={open()}
      size="sm"
      title={editingId() ? "Edit server" : "Connect"}
      onClose={cancel}
      footer={
        <>
          <Button variant="texture" textureTone="danger" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="texture" textureTone="brand" disabled={connecting()} onClick={() => void submit()}>
            {connecting() ? "Connecting…" : "Connect"}
          </Button>
        </>
      }
    >
      <FormStack>
        <Field label="Label" for="vitals-label">
          <Input id="vitals-label" value={label()} placeholder="prod-1" onInput={edit(setLabel)} disabled={connecting()} />
        </Field>
        <Field label="Host" for="vitals-host" error={fieldErrors().host}>
          <Input id="vitals-host" value={host()} required aria-invalid={!!fieldErrors().host} disabled={connecting()} placeholder="192.168.1.10" onInput={edit(setHost, "host")} />
        </Field>
        <Field label="Port" for="vitals-port" error={fieldErrors().port}>
          <Input
            id="vitals-port"
            type="number"
            min={1}
            max={65535}
            value={port()}
            aria-invalid={!!fieldErrors().port}
            disabled={connecting()}
            onInput={(event) => {
              setPort(Number(event.currentTarget.value));
              setConnectionErrors([]);
              if (fieldErrors().port) setFieldErrors({ ...fieldErrors(), port: undefined });
            }}
          />
        </Field>
        <Field label="User" for="vitals-user" error={fieldErrors().username}>
          <Input id="vitals-user" value={username()} required aria-invalid={!!fieldErrors().username} disabled={connecting()} onInput={edit(setUsername, "username")} />
        </Field>
        <Field label="Authentication">
          <Select
            aria-label="Authentication"
            value={authMode()}
            disabled={connecting()}
            onChange={(value) => {
              setAuthMode(value as AuthMode);
              clearErrors();
            }}
            options={[
              { value: "password", label: "Password" },
              { value: "privateKey", label: "Private key" },
              { value: "agent", label: "SSH agent" },
            ]}
          />
        </Field>
        <Switch>
          <Match when={authMode() === "password"}>
            <Field label="Password" for="vitals-password" error={fieldErrors().password}>
              <Input id="vitals-password" type="password" value={password()} aria-invalid={!!fieldErrors().password} disabled={connecting()} onInput={edit(setPassword, "password")} />
            </Field>
          </Match>
          <Match when={authMode() === "privateKey"}>
            <Field label="Private key path" for="vitals-key" error={fieldErrors().key}>
              <Input
                id="vitals-key"
                value={privateKeyPath()}
                aria-invalid={!!fieldErrors().key}
                disabled={connecting()}
                placeholder="/Users/you/.ssh/id_ed25519"
                onInput={edit(setPrivateKeyPath, "key")}
              />
            </Field>
            <Field label="Passphrase (optional)" for="vitals-passphrase">
              <Input
                id="vitals-passphrase"
                type="password"
                value={passphrase()}
                disabled={connecting()}
                onInput={edit(setPassphrase)}
              />
            </Field>
          </Match>
        </Switch>
        <Show when={connecting() && props.progress}>
          <span class="pw-field__hint" role="status">{props.progress}</span>
        </Show>
        <Show when={connectionErrors().length > 0}>
          <div role="alert">
            <For each={connectionErrors()}>{(message) => <span class="pw-field__error">{message}</span>}</For>
          </div>
        </Show>
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
