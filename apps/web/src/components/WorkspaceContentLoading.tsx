export function WorkspaceContentLoading(props: { readonly label: string }) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-0 flex-1 items-center justify-center"
      role="status"
    >
      <p className="text-sm text-muted-foreground">{props.label}</p>
    </div>
  );
}
