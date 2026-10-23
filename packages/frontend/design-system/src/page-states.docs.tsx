import { createSignal } from "solid-js";
import { Button } from "./button";
import {
  EmptyIllustration,
  FixtureBanner,
  PageEmpty,
  PageError,
  PageForbidden,
  PageLoading,
  PageOffline,
} from "./feedback";
import { PageSkeleton } from "./skeleton";
import type { DocEntry } from "./docs/types";

function RetryStates() {
  const [attempts, setAttempts] = createSignal(0);
  return (
    // #region retry-states
    <>
      <PageError
        message={attempts() ? `Retry attempted ${attempts()} time.` : "The project could not be loaded."}
        onRetry={() => setAttempts((count) => count + 1)}
      />
      <PageOffline
        icon="◌"
        message="The local core is unavailable."
        onRetry={() => setAttempts((count) => count + 1)}
      />
      <PageForbidden
        permission="project.write"
        onRequestAccess={() => setAttempts((count) => count + 1)}
      />
    </>
    // #endregion
  );
}

export default {
  name: "Page states",
  group: "Pages",
  summary:
    "Page states provide consistent full-panel loading, empty, error, offline, and permission feedback. EmptyIllustration is decorative artwork, and FixtureBanner remains a compatibility export that is always hidden.",
  exports: ["PageEmpty", "PageError", "PageForbidden", "PageLoading", "PageOffline", "PageSkeleton", "EmptyIllustration", "FixtureBanner"],
  examples: [
    {
      id: "empty",
      title: "Empty",
      render: () => (
        // #region empty
        <PageEmpty
          illustration={<EmptyIllustration><span class="text-[28px]">○</span></EmptyIllustration>}
          title="No decisions yet"
          description="Capture a decision to give this project durable context."
          action={<Button size="sm">Create decision</Button>}
        />
        // #endregion
      ),
    },
    {
      id: "loading-layouts",
      title: "Loading layouts",
      render: () => (
        // #region loading-layouts
        <>
          <PageLoading label="Loading table" layout="table" />
          <PageSkeleton layout="detail" />
        </>
        // #endregion
      ),
    },
    {
      id: "retry-states",
      title: "Retry and access actions",
      render: () => <RetryStates />,
    },
    {
      id: "fixture-banner",
      title: "Fixture banner",
      description: "This compatibility component is intentionally hidden in product UI.",
      render: () => (
        // #region fixture-banner
        <FixtureBanner visible message="Fixture data" />
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
