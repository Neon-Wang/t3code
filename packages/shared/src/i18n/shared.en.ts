export const sharedMessages = {
  "v2.shared.status0": "Compacting context",
  "v2.shared.status1": "Context compacted",
  "v2.shared.status2": "Created thread",
  "v2.shared.status3": "Thread created",
  "v2.shared.status4": "Read file",
  "v2.shared.status5": "Read files",
  "v2.shared.status6": "Changed file",
  "v2.shared.status7": "Changed files",
  "v2.shared.status8": "Ran command",
  "v2.shared.status9": "Running command",
  "v2.shared.status10": "Thinking",
  "v2.shared.status11": "Thought",
  "v2.shared.status12": "Working",
  "v2.shared.status13": "Worked",
  "v2.shared.status14": "Waiting",
  "v2.shared.status15": "Waiting for approval",
  "v2.shared.status16": "Stopped",
  "v2.shared.status17": "Completed",
  "v2.shared.status18": "Failed",
  "v2.shared.status19": "Queued",
  "v2.shared.status20": "From queue",
  "v2.shared.status21": "Plan ready",
  "v2.shared.status22": "Needs input",
  "v2.shared.status23": "Background work",
  "v2.shared.status24": "Reading thread",
  "v2.shared.status25": "Read thread",
  "v2.shared.status26": "Searching the web",
  "v2.shared.status27": "Searched the web",
  "v2.shared.status28": "Using browser",
  "v2.shared.status29": "Used browser",
  "v2.shared.status30": "In progress",
  "v2.shared.status31": "Interrupted",
  "v2.shared.status32": "Cancelled",
  "v2.shared.status33": "Limited",
  "v2.shared.status34": "Unknown",
  "v2.shared.status35": "Copy link",
  "v2.shared.status36": "Pull request",
  "v2.shared.status37": "Pull requests",
  "v2.shared.status38": "Merge request",
  "v2.shared.status39": "Merge requests",
  "v2.shared.group0": "Linked {count} pull requests",
  "v2.shared.group1": "Unlinked {count} pull requests",
  "v2.shared.group2": "Watching {count} pull requests",
  "v2.shared.group3": "Stopped watching {count} pull requests",
  "v2.shared.group4": "Read {count} files",
  "v2.shared.group5": "Changed {count} files",
  "v2.shared.group6": "Ran {count} commands",
  "v2.shared.group7": "Created {count} threads",
  "v2.shared.group8": "Used device controls {count} times",
  "v2.shared.group9": "Used browser {count} times",
  "v2.shared.group10": "Searched the web {count} times",
  "v2.shared.group11": "Searched code {count} times",
  "v2.shared.group12": "Used {count} tools",
  "v2.shared.group13": "Received {count} updates",
  "v2.shared.commands": "Commands",
  "v2.shared.skills": "Skills",
  "shared.gitActions.syncBranch": "Sync branch",
  "shared.gitActions.createBranchBeforeOpening":
    "Create and checkout a branch before pushing or opening {request}.",
  "shared.gitActions.addOriginBeforePushingOrCreating":
    'Add an "origin" remote before pushing or creating {request}.',
  "shared.gitActions.detachedBeforePushing": "Detached HEAD: checkout a branch before pushing.",
  "shared.gitActions.addOriginBeforePushing": 'Add an "origin" remote before pushing.',
  "shared.gitActions.viewUnavailable": "View {request} is currently unavailable.",
  "shared.gitActions.detachedBeforeCreating":
    "Detached HEAD: checkout a branch before creating {request}.",
  "shared.gitActions.addOriginBeforeCreating": 'Add an "origin" remote before creating {request}.',
  "shared.gitActions.noCommitsToInclude": "No local commits to include in {request}.",
  "shared.gitActions.behindBeforeCreating":
    "Branch is behind upstream. Pull/rebase before creating {request}.",
  "shared.gitActions.createUnavailable": "Create {request} is currently unavailable.",
  "shared.gitActions.defaultBranchSuffix":
    ' on "{branch}". You can continue on this branch or create a feature branch and run the same action there.',
  "shared.gitActions.commitPushToDefaultBranch": "Commit & push to default branch?",
  "shared.gitActions.pushToDefaultBranch": "Push to default branch?",
  "shared.gitActions.commitPushCreateFromDefaultBranch":
    "Commit, push & create {request} from default branch?",
  "shared.gitActions.commitPushCreateDescription":
    "This action will commit, push, and create {request}{suffix}",
  "shared.gitActions.pushCreateFromDefaultBranch": "Push & create {request} from default branch?",
  "shared.gitActions.pushCreateDescription":
    "This action will push local commits and create {request}{suffix}",
  "shared.linkRequest.waitingElsewhere": "Waiting for an answer in the original thread",
  "shared.linkRequest.couldNotLink": "Could not link: {failure}",
  "shared.linkRequest.otherRefused": "the other environment refused",
  "shared.linkRequest.ended": "Request ended",
  "shared.linkRequest.couldNotAnswer": "Could not answer the request. Try again.",
  "shared.usage.updatingProvider": "Updating {provider}…",
  "shared.usage.updatingProviders": "Updating {count} providers…",
  "shared.usage.updatingEnvironment": "Updating {label}…",
  "shared.usage.updatingEnvironments": "Updating {count} environments…",
  "shared.usage.malformedRecords":
    "{count} malformed or inconsistent usage record(s) were skipped; usage may be incomplete.",
  "shared.usage.serverBehind": "{label} runs an older server version and is excluded from totals.",
  "shared.usage.clientBehind":
    "This client is older than the server on {label}; its usage is excluded from totals.",
  "shared.usage.resetsMomentarily": "Resets momentarily",
  "shared.usage.resetsIn": "resets in {duration}",
  "shared.usage.resetsInRelative": "in {duration}",
  "shared.usage.now": "now",
  "shared.projectRemoval.removeWithThreads.one":
    'Remove {targetKind} "{targetLabel}" and delete its {count} thread?',
  "shared.projectRemoval.removeWithThreads.other":
    'Remove {targetKind} "{targetLabel}" and delete its {count} threads?',
  "shared.projectRemoval.threadsDeleted":
    "Those threads and any archived threads are deleted from T3 Code. Provider sessions are kept.",
  "shared.projectRemoval.archivedDeleted":
    "Any archived threads are deleted from T3 Code. Provider sessions are kept.",
  "shared.webhook.linkForPublicUrl": "Link this environment to T3 Connect for a public URL.",
  "shared.webhook.localOnly":
    "Only this computer can call this address. Link T3 Connect for a public URL.",
  "shared.webhook.reachable":
    "Works wherever this environment's address is reachable, for example over Tailscale or your own proxy. Link T3 Connect for a public URL.",
  "shared.sourceControl.bitbucketEmailHint": "With an API token instead of an access token.",
  "shared.sourceControl.bitbucketApiTokenHint":
    "Reaches every repository your Atlassian account can. Give it read and write access to repositories and pull requests, and read:user:bitbucket.",
  "shared.sourceControl.gitcafeTokenHint":
    "A git.cafe token, used before CAFE_TOKEN and the cafe login, so GitCafe works without the CLI signed in.",
  "shared.sourceControl.githubTokenAccess": "read and write access to pull requests and contents",
  "shared.sourceControl.githubInstallHint":
    "Install the GitHub command-line tool (`gh`) via https://cli.github.com/ or your package manager (for example `brew install gh`).",
  "shared.sourceControl.gitlabInstallHint":
    "Install the GitLab command-line tool (`glab`) from https://gitlab.com/gitlab-org/cli or your package manager (for example `brew install glab`).",
  "shared.sourceControl.forgejoInstallHint":
    "Install `fj` 0.6 or later from https://codeberg.org/forgejo-contrib/forgejo-cli and run `fj --host <server-url> auth add-token`, or install `tea` 0.16 or later from https://gitea.com/gitea/tea and run `tea login add` for each Forgejo or Gitea server.",
  "shared.sourceControl.azureInstallHint":
    "Install the Azure command-line tools (`az`), then enable Azure DevOps support with `az extension add --name azure-devops`.",
  "shared.sourceControl.bitbucketInstallHint":
    "Add a Bitbucket token in Settings → Source Control.",
  "shared.sourceControl.providerStatusUnavailable":
    "Provider status unavailable. Open Source Control settings and rescan.",
  "shared.sourceControl.notAuthenticated":
    "{provider} is not authenticated. Open Source Control settings for setup guidance.",
} as const;
