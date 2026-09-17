# Source Control Integrations

Coda connects to your Git hosting provider so you can create pull requests, review code, and manage repositories without leaving the app.

## Supported Providers

Coda works with the platforms your team already uses:

- **GitHub** – Pull requests, repository creation, and clone integration
- **GitLab** – Merge requests, repository publishing, and hosted clones
- **Bitbucket** – Pull request workflows (via API token authentication)
- **Azure DevOps** – Pull request support for Microsoft-hosted repositories

## What You Can Do

### Start Projects from Anywhere

**Clone repositories directly**

- Open the Command Palette (`Cmd/Ctrl + K`) → **Add Project**
- Choose **GitHub repository**, **GitLab repository**, **Bitbucket repository**, **Azure DevOps repository**, or paste any **Git URL**
- Enter the repository path (`owner/repo`, `group/project`, `workspace/repository`, or `project/repository`) or a full Git URL, pick a destination, and start coding

**Publish local projects to the cloud**

- Have a local Git repository without a remote?
- Use the **Publish Repository** action to create a new hosted repository (GitHub, GitLab, Bitbucket, or Azure DevOps), add it as your origin remote, and push, in one flow
- If the local repository has no commits yet, publishing creates the remote and wires it up but does not push. Make a commit, then push normally.

### Manage Code Reviews Without Context Switching

**Create pull requests while you work**

- Push a branch and create a pull request from the Git actions controls in the toolbar
- Coda can suggest titles and descriptions based on your commits
- Supports GitHub Pull Requests, GitLab Merge Requests, Bitbucket Pull Requests, and Azure DevOps Pull Requests

**Stay on top of open reviews**

- See if your current branch already has an open PR/MR
- Open several reviews from the **Pull requests** page as tabs in the right panel
- While working in a thread, open linked reviews in the same compact right-panel tabs without
  leaving the conversation
- Open the review directly in your browser with one click
- Command-click (Control-click on Windows and Linux) a pull request number in the sidebar to open it in your browser instead of in Coda
- Check out a teammate's branch to review code locally

**Fix what you wrote, in place**

- Rewrite a pull request's title and description from the review itself, in Markdown, with a
  preview before you save
- Rewrite your own comments the same way, wherever they are shown
- Works on GitHub, GitLab, and Bitbucket. Azure DevOps takes a new title and description; its
  comments stay read-only here, as they already were

### Know Your Setup at a Glance

The **Source Control settings** page shows you exactly what's connected:

- ✅ Which providers are authenticated and ready
- ⚠️ What's missing and how to fix it
- 👤 Which account is signed in (when available)

Run a quick **Rescan** after setting up a new machine or changing credentials.

## Getting Started

### For GitHub (Recommended for most users)

1. Install the GitHub CLI on the machine running Coda:
   ```bash
   brew install gh
   ```
2. Open **Settings → Source Control** and choose **Connect GitHub**. Your server administrator
   must configure a GitHub OAuth app for this button to work.

   Connect GitHub signs in **this Coda client**. Each paired web, desktop, or mobile session keeps
   its own GitHub account. Disconnecting or revoking that session removes only that client's
   GitHub access.

   If browser sign-in is not configured, the server can still use a shared GitHub CLI login as a
   compatibility fallback:

   ```bash
   gh auth login
   ```

   Managed Connect GitHub credentials always take priority over that host-level login.

3. Verify GitHub shows as authenticated for this client. Use **Disconnect** on the same page to
   remove this client's GitHub account. That does not sign out a host-level `gh auth login`.

You can now clone, publish, create pull requests, and push using this client's GitHub sign-in.
Hosted Coda servers do not use SSH keys. Connect GitHub authenticates `git push` and `git fetch`
over HTTPS, including when the repo remote is an `git@github.com` SSH URL.

### Git author name and email

When this Coda client is signed in with GitHub, commits from the Git actions button, agent
shells, and Coda terminals are authored as that GitHub user. GitHub links them with the
noreply address `id+login@users.noreply.github.com`.

If GitHub is not connected, Coda uses Git's `user.name` and `user.email`. If those are also
unset (common on a hosted server), commits still succeed and are authored as **Coda**.
GitHub will not attribute those commits to your account.

To override the author on the machine running Coda without Connect GitHub, set them in a Coda
terminal:

```bash
git config --global user.name "Your Name"
git config --global user.email "12345678+you@users.noreply.github.com"
```

Use the noreply address from GitHub → Settings → Emails so GitHub links the commits to you.
That config lives on the Coda server, not on your laptop.

On a hosted environment a global Git config applies to every project there. Connect GitHub is
per client and takes precedence for that client's commits.

### For GitLab

1. Install the GitLab CLI:
   ```bash
   brew install glab
   ```
2. Authenticate:
   ```bash
   glab auth login
   ```
3. Check **Settings → Source Control** to confirm the connection

### For Bitbucket

Bitbucket uses tokens instead of a CLI tool. Two options, both set as environment variables on the
machine running Coda.

Recommended, a Bitbucket access token:

```bash
export T3CODE_BITBUCKET_ACCESS_TOKEN="your-access-token"
```

Or an Atlassian account email plus API token, with read/write access to pull requests and
repositories:

```bash
export T3CODE_BITBUCKET_EMAIL="you@example.com"
export T3CODE_BITBUCKET_API_TOKEN="your-token"
```

If both are set, the access token wins. Restart Coda and verify the connection in **Source
Control settings**.

### For Azure DevOps

1. Install Azure CLI:
   ```bash
   brew install azure-cli
   ```
2. Add the DevOps extension:
   ```bash
   az extension add --name azure-devops
   ```
3. Sign in:
   ```bash
   az login
   ```

---

## Requirements & Troubleshooting

**Git is required** – Coda uses Git for all local operations. Ensure `git` is installed on your server.

**Server-side setup** – Connect GitHub is per paired client. Other providers still authenticate on the machine running Coda. If you're using a hosted or team instance, your administrator may have already configured the GitHub OAuth app and callback URL.

**Common issues:**

- **Provider shows "Not authenticated"** – Choose **Connect GitHub** in Settings for this client, or run the login command for that provider (e.g. `gh auth login`) in a terminal on the server as a shared fallback, then rescan in Settings
- **Bitbucket not connecting** – Double-check your environment variables are set in the correct shell profile and the server was restarted
- **Can't push to a remote** – Connect GitHub in Settings for this client. Hosted Coda pushes
  over HTTPS with that sign-in; SSH remotes on a server without keys will fail. If GitHub is
  already connected, fetch and retry in case the remote moved.
- **Commits show up as Coda** – Sign in with GitHub on this Coda client so commits use your
  GitHub identity. If GitHub is not connected, set `user.name` and `user.email` in a Coda
  terminal (see [Git author name and email](#git-author-name-and-email)).

**Need more help?** Check your provider's CLI documentation:

- [GitHub CLI](https://cli.github.com/)
- [GitLab CLI](https://gitlab.com/gitlab-org/cli)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/)
