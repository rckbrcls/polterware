import { Button, PageEmpty } from "@polterware/frontend-design-system";

export function IntegrationsConnectedEmpty(props: { onOpenCatalog?: () => void }) {
  return (
    <PageEmpty
      title="Nothing connected"
      mood="sleeping"
      action={
        props.onOpenCatalog ? (
          <Button size="sm" variant="primary" onClick={() => props.onOpenCatalog?.()}>
            Open catalog
          </Button>
        ) : undefined
      }
    />
  );
}

export function IntegrationsCatalogFilterEmpty() {
  return <PageEmpty title="No matches" mood="lost" />;
}
