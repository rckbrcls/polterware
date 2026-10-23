import { onMount } from "solid-js";
import { Link, Meta, Title } from "@solidjs/meta";

/** The old Vitals landing moved to `/`. A static host has no redirects, so the page sends visitors on. */
export default function VitalsRedirect() {
  onMount(() => window.location.replace("/"));
  return <main id="main" tabindex="-1" class="site-container not-found">
    <Title>polterware</Title>
    <Meta http-equiv="refresh" content="0; url=/" />
    <Meta name="robots" content="noindex" />
    <Link rel="canonical" href="https://polterware.com/" />
    <p>Polterware Vitals moved to the <a class="text-link" href="/">home page</a>.</p>
  </main>;
}
