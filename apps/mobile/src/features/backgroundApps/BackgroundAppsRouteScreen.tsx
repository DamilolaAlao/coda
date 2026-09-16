import type { BackgroundAppSnapshot } from "@t3tools/contracts";
import { EnvironmentId, isUnownedDiscoveredApp, ThreadId } from "@t3tools/contracts";
import type { StaticScreenProps } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { backgroundAppsEnvironment } from "../../state/backgroundApps";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { useEnvironmentQuery } from "../../state/query";

type Props = StaticScreenProps<{
  readonly environmentId: string;
  readonly threadId: string;
}>;

function ActionButton(props: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      className="rounded-lg border border-border bg-card px-3 py-2 disabled:opacity-40"
    >
      <Text className="text-sm font-semibold">{props.label}</Text>
    </Pressable>
  );
}

function AppCard(props: {
  readonly app: BackgroundAppSnapshot;
  readonly environmentId: EnvironmentId;
  readonly busy: boolean;
  readonly onRestart: () => void;
  readonly onStop: () => void;
}) {
  const { app } = props;
  const logs = useEnvironmentQuery(
    app.capabilities.canReadLogs
      ? backgroundAppsEnvironment.logs({
          environmentId: props.environmentId,
          input: { appId: app.id },
        })
      : null,
  );
  const endpoint = app.previewUrl ?? app.endpoints[0]?.url ?? null;
  const logText =
    logs.data?._tag === "snapshot" || logs.data?._tag === "output" ? logs.data.data : null;
  const unavailable = isUnownedDiscoveredApp(app)
    ? "Found by its listening HTTP port. Stop and logs need a Coda terminal."
    : app.source === "discovered" && !app.capabilities.canRestart
      ? "Restart is unavailable because Coda did not launch this process."
      : null;

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="font-semibold">{app.label}</Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            {app.status} · {app.source === "managed" ? "Managed" : "Discovered"}
          </Text>
        </View>
        <View
          className={`mt-1 size-2.5 rounded-full ${
            app.status === "running" ? "bg-green-500" : "bg-muted-foreground"
          }`}
        />
      </View>
      {app.command ? (
        <Text selectable className="font-mono text-xs text-muted-foreground">
          {app.command}
        </Text>
      ) : null}
      {app.endpoints.map((item) => (
        <Text key={item.url} selectable className="text-xs text-muted-foreground">
          {item.url}
        </Text>
      ))}
      {unavailable ? <Text className="text-xs text-muted-foreground">{unavailable}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {app.capabilities.canOpen && endpoint ? (
          <ActionButton
            label="Open Preview"
            onPress={() => void tryOpenExternalUrl(endpoint, "markdown-link")}
          />
        ) : null}
        {app.capabilities.canRestart ? (
          <ActionButton label="Restart" disabled={props.busy} onPress={props.onRestart} />
        ) : null}
        {app.capabilities.canStop ? (
          <ActionButton label="Stop" disabled={props.busy} onPress={props.onStop} />
        ) : null}
      </View>
      {app.capabilities.canReadLogs ? (
        logText ? (
          <ScrollView className="max-h-48 rounded-lg bg-black/90 p-3" nestedScrollEnabled>
            <Text selectable className="font-mono text-xs text-white/80">
              {logText.slice(-4_000)}
            </Text>
          </ScrollView>
        ) : (
          <Text className="text-xs text-muted-foreground">No logs yet.</Text>
        )
      ) : (
        <Text className="text-xs text-muted-foreground">Logs are unavailable for this process.</Text>
      )}
    </View>
  );
}

export function BackgroundAppsRouteScreen({ route }: Props) {
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const threadId = ThreadId.make(route.params.threadId);
  const listApps = useAtomQueryRunner(backgroundAppsEnvironment.list, {
    reportFailure: false,
  });
  const stopApp = useAtomCommand(backgroundAppsEnvironment.stop, {
    reportFailure: false,
  });
  const restartApp = useAtomCommand(backgroundAppsEnvironment.restart, {
    reportFailure: false,
  });
  const [apps, setApps] = useState<ReadonlyArray<BackgroundAppSnapshot>>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listApps({ environmentId, input: { threadId } });
    setLoading(false);
    if (result._tag === "Success") setApps(result.value.apps);
  }, [environmentId, listApps, threadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(
    async (operation: "restart" | "stop", appId: string) => {
      setBusyId(appId);
      const run = operation === "restart" ? restartApp : stopApp;
      const result = await run({ environmentId, input: { appId } });
      setBusyId(null);
      if (result._tag === "Failure") {
        Alert.alert("Background app", `Unable to ${operation} this app.`);
        return;
      }
      await refresh();
    },
    [environmentId, refresh, restartApp, stopApp],
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-3 p-4 pb-10"
    >
      {loading ? <Text className="text-muted-foreground">Loading background apps…</Text> : null}
      {!loading && apps.length === 0 ? (
        <View className="items-center gap-2 py-16">
          <Text className="text-lg font-semibold">No background apps</Text>
          <Text className="text-center text-muted-foreground">
            Run a background project script, or start a local HTTP server in this workspace.
          </Text>
        </View>
      ) : null}
      {apps.map((app) => (
        <AppCard
          key={app.id}
          app={app}
          environmentId={environmentId}
          busy={busyId === app.id}
          onRestart={() => void mutate("restart", app.id)}
          onStop={() => void mutate("stop", app.id)}
        />
      ))}
    </ScrollView>
  );
}
