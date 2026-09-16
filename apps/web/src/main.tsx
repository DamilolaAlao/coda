import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { passkeys } from "@clerk/electron/passkeys";
import { ClerkProvider as ElectronClerkProvider } from "@clerk/electron/react";
import { createHashHistory, createBrowserHistory } from "@tanstack/react-router";

import "./index.css";

import { isElectron } from "./env";
import { ManagedRelayAuthProvider } from "./cloud/managedAuth";
import { hasCloudPublicConfig } from "./cloud/publicConfig";
import { getRouter } from "./router";
import {
  syncDocumentElectronPlatformClasses,
  syncDocumentWindowControlsOverlayClass,
} from "./lib/windowControlsOverlay";
import { AppRoot } from "./AppRoot";
import { clerkAppearance } from "./components/clerk/clerkAppearance";
import {
  clearStaleChunkReload,
  recoverFromStaleChunkLoad,
  withoutStaleChunkCacheBust,
  withStaleChunkCacheBust,
} from "./staleChunkReload.logic";

const reloadPastHttpCache = () => {
  window.location.replace(withStaleChunkCacheBust(window.location.href, Date.now()));
};

const cleanedLocation = withoutStaleChunkCacheBust(window.location.href);
if (cleanedLocation) {
  window.history.replaceState(window.history.state, "", cleanedLocation);
}

window.addEventListener("vite:preloadError", (event) => {
  const recovered = recoverFromStaleChunkLoad({
    error:
      "payload" in event && event.payload instanceof Error
        ? event.payload
        : new TypeError("Failed to fetch dynamically imported module"),
    storage: typeof sessionStorage === "undefined" ? null : sessionStorage,
    reload: reloadPastHttpCache,
  });
  if (recovered) {
    event.preventDefault();
  }
});

// Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
const history = isElectron ? createHashHistory() : createBrowserHistory();

const router = getRouter(history);

if (isElectron) {
  syncDocumentElectronPlatformClasses(navigator.platform);
  syncDocumentWindowControlsOverlayClass();
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const app = <AppRoot router={router} />;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {clerkPublishableKey && hasCloudPublicConfig() ? (
      isElectron ? (
        <ElectronClerkProvider
          appearance={clerkAppearance}
          publishableKey={clerkPublishableKey}
          passkeys={passkeys}
        >
          <ManagedRelayAuthProvider>{app}</ManagedRelayAuthProvider>
        </ElectronClerkProvider>
      ) : (
        <ClerkProvider appearance={clerkAppearance} publishableKey={clerkPublishableKey}>
          <ManagedRelayAuthProvider>{app}</ManagedRelayAuthProvider>
        </ClerkProvider>
      )
    ) : (
      app
    )}
  </React.StrictMode>,
);

window.setTimeout(() => {
  // Leave the one-shot guard in place until this bundle has had a chance to
  // fail again; clearing it on boot would reload-loop if HTML is still stale.
  clearStaleChunkReload(typeof sessionStorage === "undefined" ? null : sessionStorage);
}, 3_000);
