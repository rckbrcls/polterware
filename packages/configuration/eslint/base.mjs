/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/release/**",
      "**/backend/platform/gen/**",
      "**/.turbo/**",
    ],
  },
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "electron",
              message: "Only apps/polterware-desktop may import electron.",
            },
          ],
          patterns: [
            {
              group: ["apps/*", "apps/*/*"],
              message: "Shared packages must not import apps.",
            },
            {
              group: ["node:*", "fs", "path", "child_process"],
              message: "Renderer/browser packages must not import Node builtins.",
            },
          ],
        },
      ],
    },
  },
];
