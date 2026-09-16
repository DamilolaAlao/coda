import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { APP_BASE_NAME } from "../../branding";
import { applyHostedLandingDocumentChrome } from "./HostedLandingPage.logic";

import "./HostedLandingPage.css";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&display=swap";
const DOWNLOAD_HREF = "https://github.com/DamilolaAlao/coda/releases";
const GITHUB_HREF = "https://github.com/DamilolaAlao/coda";

const FEATURES = [
  {
    title: "Synced threads",
    body: "Keep agent history with the project, then pick it up from the browser, desktop, or phone.",
    icon: "thread",
  },
  {
    title: "Bring your own agent",
    body: "Orchestrate Claude Code, Codex, Cursor, Grok, Hermes, and OpenCode with the plans you already pay for.",
    icon: "agent",
  },
  {
    title: "GitHub clone and push",
    body: "Search your repos, clone over HTTPS, then commit and open a pull request from the same surface.",
    icon: "git",
  },
  {
    title: "Background apps",
    body: "Launch, inspect, and stop the servers your agent starts without leaving the thread.",
    icon: "apps",
  },
  {
    title: "Remote ready",
    body: "Pair from the local network, Tailscale, or a hosted environment. The websocket layer is the product.",
    icon: "remote",
  },
  {
    title: "Open source",
    body: "Fork the whole stack. Coda stays a bring-your-own-subscription control plane, not a token reseller.",
    icon: "fork",
  },
] as const;

const PLATFORMS = [
  {
    name: "Web app",
    detail: "Chat, git, and apps — in the browser",
    href: "/pair",
    action: "Open web app",
  },
  {
    name: "macOS",
    detail: "Native desktop for Apple Silicon and Intel",
    href: DOWNLOAD_HREF,
    action: "Download for Mac",
  },
  {
    name: "Windows",
    detail: "Installer build from GitHub Releases",
    href: DOWNLOAD_HREF,
    action: "Download for Windows",
  },
  {
    name: "Linux",
    detail: "AppImage for modern Linux desktops",
    href: DOWNLOAD_HREF,
    action: "Download for Linux",
  },
  {
    name: "Mobile",
    detail: "Control the same environment from iOS or Android",
    href: DOWNLOAD_HREF,
    action: "See releases",
  },
] as const;

const PROVIDERS = [
  { src: "/harnesses/claude-ai-icon.svg", alt: "Claude Code" },
  { src: "/harnesses/openai_dark.svg", alt: "Codex" },
  { src: "/harnesses/cursor_light.svg", alt: "Cursor" },
  { src: "/harnesses/grok-dark.svg", alt: "Grok" },
  { src: "/harnesses/opencode-dark.svg", alt: "OpenCode" },
] as const;

function FeatureIcon({ name }: { readonly name: (typeof FEATURES)[number]["icon"] }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "thread":
      return (
        <svg {...common}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      );
    case "agent":
      return (
        <svg {...common}>
          <path d="M12 3v18M8 8l4-4 4 4M8 16l4 4 4-4" />
        </svg>
      );
    case "git":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="6" cy="18" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <path d="M6 8v8M18 8v5a3 3 0 01-3 3h-3" />
        </svg>
      );
    case "apps":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 20h8" />
        </svg>
      );
    case "remote":
      return (
        <svg {...common}>
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      );
    case "fork":
      return (
        <svg {...common}>
          <circle cx="6" cy="5" r="2.2" />
          <circle cx="18" cy="5" r="2.2" />
          <circle cx="12" cy="19" r="2.2" />
          <path d="M6 7.2v2A3 3 0 009 12.2h6A3 3 0 0018 9.2v-2M12 14v2.8" />
        </svg>
      );
  }
}

function ExternalLink({
  href,
  children,
  className,
}: {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function HostedLandingPage() {
  useEffect(() => {
    return applyHostedLandingDocumentChrome(document);
  }, []);

  useEffect(() => {
    const id = "hosted-landing-fonts";
    if (document.getElementById(id)) return;
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = "https://fonts.googleapis.com";
    const preconnectStatic = document.createElement("link");
    preconnectStatic.rel = "preconnect";
    preconnectStatic.href = "https://fonts.gstatic.com";
    preconnectStatic.crossOrigin = "anonymous";
    const fonts = document.createElement("link");
    fonts.id = id;
    fonts.rel = "stylesheet";
    fonts.href = FONT_HREF;
    document.head.append(preconnect, preconnectStatic, fonts);
  }, []);

  return (
    <div className="hosted-landing">
      <div className="hosted-landing-shell">
        <div className="hosted-landing-glow" aria-hidden="true" />
        <div className="hosted-landing-grid" aria-hidden="true" />

        <header className="hosted-landing-nav">
          <Link to="/" className="hosted-landing-mark">
            {APP_BASE_NAME}
          </Link>
          <div className="hosted-landing-nav-links">
            <a href="#features">Features</a>
            <a href="#platforms">Platforms</a>
            <ExternalLink href={GITHUB_HREF}>GitHub</ExternalLink>
          </div>
          <div className="hosted-landing-nav-actions">
            <Link to="/pair" className="hosted-landing-pill hosted-landing-pill--ghost">
              Open app
            </Link>
            <ExternalLink href={DOWNLOAD_HREF} className="hosted-landing-pill hosted-landing-pill--mint">
              Download
            </ExternalLink>
          </div>
        </header>

        <section className="hosted-landing-hero">
          <p className="hosted-landing-wordmark">{APP_BASE_NAME}</p>
          <h1 className="hosted-landing-kicker">Agents, git, and apps — one private stack.</h1>
          <p className="hosted-landing-sub">
            Run Coda in the browser or on your desktop. Assistants, GitHub workspaces, and background
            apps for live servers.
          </p>
          <div className="hosted-landing-cta">
            <Link to="/pair" className="hosted-landing-pill hosted-landing-pill--light">
              Open web app
              <span aria-hidden="true">↗</span>
            </Link>
            <ExternalLink href={DOWNLOAD_HREF} className="hosted-landing-pill hosted-landing-pill--ghost">
              Download desktop
            </ExternalLink>
          </div>

          <div className="hosted-landing-providers">
            <span>Works with</span>
            {PROVIDERS.map((provider) => (
              <img key={provider.alt} src={provider.src} alt={provider.alt} />
            ))}
          </div>

          <div className="hosted-landing-preview" aria-hidden="true">
            <div className="hosted-landing-chrome">
              <span />
              <span />
              <span />
              <em>coda · typescript-rest-api</em>
            </div>
            <div className="hosted-landing-tabs">
              <span className="hosted-landing-tab is-active">New chat</span>
              <span className="hosted-landing-tab">Clone repo</span>
              <span className="hosted-landing-tab">Review PR</span>
              <span className="hosted-landing-tab">Apps</span>
            </div>
            <div className="hosted-landing-note">
              <div className="hosted-landing-note-head">
                <div>
                  <div className="hosted-landing-note-kicker">Workspace</div>
                  <strong>Clone the API, then start the server.</strong>
                </div>
                <span className="hosted-landing-status">Running</span>
              </div>
              <p>Search GitHub, clone over HTTPS, then keep the thread on the same project.</p>
              <p>Artifacts stay attached. Remote clients see the same environment.</p>
              <div className="hosted-landing-files">
                <code>apps/server/src/ws.ts</code>
                <code>packages/contracts/src/rpc.ts</code>
              </div>
            </div>
            <div className="hosted-landing-composer">
              <span>Message Coda…</span>
              <span className="hosted-landing-send" />
            </div>
          </div>
        </section>

        <section className="hosted-landing-section" id="features">
          <div className="hosted-landing-eyebrow">Features</div>
          <h2>Everything you need to think, ship, and share.</h2>
          <div className="hosted-landing-grid-cards">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="hosted-landing-card">
                <span className="hosted-landing-feature-mark">
                  <FeatureIcon name={feature.icon} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="hosted-landing-section" id="platforms">
          <div className="hosted-landing-eyebrow">Platforms</div>
          <h2>Web app and native desktops. Remote included.</h2>
          <p className="hosted-landing-sub">
            Start in the browser, install the desktop shell when you want a dedicated window, or pair
            mobile to the same environment.
          </p>
          <div className="hosted-landing-platforms">
            {PLATFORMS.map((platform) => {
              const action =
                platform.href === "/pair" ? (
                  <Link to="/pair" className="hosted-landing-cta-link">
                    {platform.action}
                  </Link>
                ) : (
                  <ExternalLink href={platform.href} className="hosted-landing-cta-link">
                    {platform.action}
                  </ExternalLink>
                );
              return (
                <div key={platform.name} className="hosted-landing-platform">
                  <div>
                    <b>{platform.name}</b>
                    <span>{platform.detail}</span>
                  </div>
                  {action}
                </div>
              );
            })}
          </div>
        </section>

        <section className="hosted-landing-section hosted-landing-close" id="download">
          <div className="hosted-landing-close-glow" aria-hidden="true" />
          <div className="hosted-landing-eyebrow">Get started</div>
          <h2>Open the web app, or install where you work.</h2>
          <div className="hosted-landing-cta">
            <Link to="/pair" className="hosted-landing-pill hosted-landing-pill--light">
              Open web app
            </Link>
            <ExternalLink href={DOWNLOAD_HREF} className="hosted-landing-pill hosted-landing-pill--ghost">
              GitHub Releases
            </ExternalLink>
          </div>
        </section>

        <footer className="hosted-landing-footer">
          <span>{APP_BASE_NAME}</span>
          <Link to="/pair">Web app</Link>
          <ExternalLink href={DOWNLOAD_HREF}>Downloads</ExternalLink>
          <ExternalLink href={GITHUB_HREF}>GitHub</ExternalLink>
        </footer>
      </div>
    </div>
  );
}
