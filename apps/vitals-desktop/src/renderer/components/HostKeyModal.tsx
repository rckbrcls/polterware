import { A11yDialog, Button } from "@polterware/frontend-design-system";

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
          <Button onClick={props.onReject}>
            Reject
          </Button>
          <Button variant="brand" onClick={props.onAccept}>
            Trust and connect
          </Button>
        </>
      }
    >
      <code class="vitals-fingerprint">{props.fingerprint}</code>
    </A11yDialog>
  );
}
