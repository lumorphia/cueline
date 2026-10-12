import tseslint from "typescript-eslint";

// 依存の向き (AGENTS.md、ADR-0004): script <- engine、script <- speech、全部 <- apps/web。
// flat config は同じルールを後ろの設定で上書きするので、パッケージごとに制限を全部並べる

const NODE_APIS = ["node:*", "fs", "path", "crypto", "os", "child_process"];
const REACT = ["react", "react-dom", "react/*", "react-dom/*"];
const DEEP = {
  group: ["@cueline/*/src/*"],
  message: "ほかのパッケージは package.json の exports から使う",
};

const restrict = (patterns) => ({
  rules: { "no-restricted-imports": ["error", { patterns }] },
});

const script = {
  files: ["packages/script/**/*.ts"],
  ...restrict([
    { group: NODE_APIS, message: "script はブラウザで動く。Node API を使わない" },
    {
      group: ["@cueline/engine", "@cueline/speech", ...REACT],
      message: "script は zod と yaml だけに依存する",
    },
  ]),
};

const engine = {
  files: ["packages/engine/**/*.ts"],
  ...restrict([
    { group: NODE_APIS, message: "engine はブラウザで動く。Node API を使わない" },
    { group: REACT, message: "engine は React に依存しない (画面は apps/web)" },
    {
      group: ["@cueline/speech"],
      message: "engine は speech を知らない。通知は onFire で外に渡す",
    },
    DEEP,
  ]),
};

const speech = {
  files: ["packages/speech/**/*.ts"],
  ...restrict([
    { group: NODE_APIS, message: "speech はブラウザで動く。Node API を使わない" },
    { group: REACT, message: "speech は React に依存しない (画面は apps/web)" },
    {
      group: ["@cueline/engine"],
      message: "speech は engine を知らない。コールは apps/web が渡す",
    },
    DEEP,
  ]),
};

const web = {
  files: ["apps/web/src/**/*.{ts,tsx}"],
  rules: {
    ...restrict([{ group: NODE_APIS, message: "画面はブラウザで動く。Node API を使わない" }, DEEP])
      .rules,
    // スクリプトの文字列を HTML として出さない (docs/design/07-security.md)
    "no-restricted-syntax": [
      "error",
      {
        selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
        message: "文字列は React のテキストとして出す (07-security)",
      },
    ],
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "test-results/**",
      "playwright-report/**",
      // PoC の計測ページ (本体から import しない使い捨て。docs/design/08-poc.md)
      "spikes/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  script,
  engine,
  speech,
  web,
);
