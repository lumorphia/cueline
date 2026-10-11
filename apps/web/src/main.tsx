import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { I18nProvider } from "./i18n/context.tsx";
import { SettingsProvider } from "./settings/context.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root が無い");
createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </I18nProvider>
  </StrictMode>,
);
