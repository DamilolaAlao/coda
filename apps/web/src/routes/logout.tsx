import { createFileRoute, redirect } from "@tanstack/react-router";

import { logoutServerSession } from "../environments/primary";

export const Route = createFileRoute("/logout")({
  beforeLoad: async () => {
    try {
      await logoutServerSession();
    } catch {
      // Already signed out or the cookie never landed; still leave the app.
    }
    throw redirect({ to: "/pair", replace: true });
  },
  component: LogoutRouteView,
});

function LogoutRouteView() {
  return null;
}
