import { createHandler, StartServer, type StartHandler } from "@solidjs/start/server";
const handler: StartHandler = createHandler(() => <StartServer document={props => (
  <html lang="en" class="dark" translate="no">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="google" content="notranslate" />
      <meta name="color-scheme" content="dark" />
      <meta name="theme-color" content="#131313" />
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      {props.assets}
    </head>
    <body translate="no"><div id="app">{props.children}</div>{props.scripts}</body>
  </html>
)} />);

export default handler;
