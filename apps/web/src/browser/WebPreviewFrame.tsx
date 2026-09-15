"use client";

import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";

export function WebPreviewFrame(props: {
  readonly src: string;
  readonly reloadEpoch: number;
  readonly className?: string;
  readonly onLoad?: () => void;
  readonly onError?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !props.src) return;
    iframe.src = props.src;
  }, [props.reloadEpoch, props.src]);

  return (
    <iframe
      ref={iframeRef}
      className={cn("h-full w-full border-0 bg-background", props.className)}
      onError={() => props.onError?.()}
      onLoad={() => props.onLoad?.()}
      referrerPolicy="no-referrer-when-downgrade"
      sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      src={props.src}
      title="Preview"
    />
  );
}
