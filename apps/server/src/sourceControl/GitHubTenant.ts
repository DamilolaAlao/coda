import { AuthSessionId } from "@t3tools/contracts";
import * as Context from "effect/Context";

export interface GitHubTenantContext {
  readonly sessionId: AuthSessionId;
}

export class GitHubTenant extends Context.Reference<GitHubTenantContext | null>(
  "t3/sourceControl/GitHubTenant",
  { defaultValue: () => null },
) {}
