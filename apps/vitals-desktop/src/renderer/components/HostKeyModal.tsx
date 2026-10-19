import { A11yDialog, ControlButton } from "@polterware/frontend-design-system";

export function HostKeyModal(props: {
  host: string;
  port: number;
  fingerprint: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <A11yDialog
      open
      size="sm"
      title="Unknown host key"
      description={`First connection to ${props.host}:${props.port}. Verify the fingerprint before trusting this server.`}
      onClose={props.onReject}
      footer={
        <>
          <ControlButton tone="secondary" onClick={props.onReject}>
            Reject
          </ControlButton>
          <ControlButton tone="brand" onClick={props.onAccept}>
            Trust and connect
          </ControlButton>
        </>
      }
    >
      <code class="vitals-fingerprint">{props.fingerprint}</code>
    </A11yDialog>
  );
}
