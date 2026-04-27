# SECURITY.md

Honest threat model for groundtruth. Read before you install.

## What you're installing

The single-paste install runs:

```bash
curl -fsSL https://raw.githubusercontent.com/vnmoorthy/groundtruth/main/install.sh | bash
```

That fetches `install.sh` from GitHub over HTTPS and executes it as a shell script. The script then:

1. Clones the repo to `~/.groundtruth` (HTTPS, GitHub).
2. Copies `skills/groundtruth/SKILL.md` to `~/.claude/skills/groundtruth/`.
3. Modifies `~/.claude/settings.json` to register a Stop hook that runs `node ~/.groundtruth/bin/groundtruth.mjs hook` on every assistant turn.
4. Symlinks `groundtruth` into `~/.local/bin`.

## What the hook can do

The Stop hook runs as **your user**. It has the same capabilities as any other process you start. Specifically:

- It can read everything in your home directory.
- It can write to `~/.claude/projects/*/*.jsonl` (the session transcripts) and to `~/.claude/settings.json` (when you run `groundtruth install`).
- It can read `transcript_path` and `cwd` passed by Claude Code, which let it identify your active session and working directory.
- It does **not** make outbound network calls. The hook code in `src/hook-entry.mjs` has no network imports. The audit code in `src/audit.mjs` reads JSONL from disk only. The CLI uses `node:fs` and `node:os`; no `node:http`, no `node:https`, no `fetch`, no third-party SDKs.

You can verify all of this with `grep -r "fetch\|http\|https" src/ bin/` — it returns nothing.

## What it does NOT do

- No telemetry. Anonymous or otherwise. The tool never phones home.
- No credentials. The hook does not read your tokens, secrets, or auth files.
- No write to anything outside `~/.claude/`, `~/.local/bin/groundtruth`, and the install dir at `~/.groundtruth`.
- No background processes. Each invocation is a synchronous Node process that exits.

## The realistic threat model

**Threat 1: a malicious dependency.**

groundtruth has zero runtime dependencies. The `package.json` `dependencies` block is empty. There are no devDependencies needed at runtime; the tests run on Node's built-in runner. So there is no `npm install` step where a transitive dependency could include a postinstall script that exfiltrates data.

The audit command for this: `cat package.json | jq '.dependencies, .devDependencies'` returns `null` and `null`.

**Threat 2: the install script is malicious or compromised.**

The `install.sh` is small (~150 lines, plain shell) and lives in this same repo on `main`. You can read it before you run it:

```bash
curl -fsSL https://raw.githubusercontent.com/vnmoorthy/groundtruth/main/install.sh | less
```

There is no obfuscation, no base64 payload, no eval of fetched data. The script does what `INSTALL_SH:` block at the top of itself describes.

If you don't trust running scripts via `curl | bash`, the alternative is `git clone https://github.com/vnmoorthy/groundtruth.git ~/.groundtruth && bash ~/.groundtruth/install.sh`. Same outcome, with a chance to read the cloned source first.

**Threat 3: a future commit on `main` is malicious.**

This is the realistic ongoing risk. The install line points at `main`, which is mutable. If maintainer credentials are compromised or a malicious PR is merged, the install line would deliver the bad code on the next `bash install.sh` run.

Mitigations now in place (added in v0.1.10 per `/cso` security review):

- **CODEOWNERS** at `.github/CODEOWNERS` requires explicit review from `@vnmoorthy` on the highest-blast-radius paths: `/.github/` (CI workflows), `/install.sh` (entry point), `/src/hook-entry.mjs`, `/src/install.mjs`, `/src/memory-hook-entry.mjs`, `/skills/`, and `SECURITY.md` itself.
- **GitHub Actions SHA-pinning** in `.github/workflows/ci.yml` removes the floating-tag attack on `actions/checkout` and `actions/setup-node`. SHAs are immutable; tags are not.
- **Dependabot** at `.github/dependabot.yml` keeps the pinned SHAs current as upstream actions release new versions, so we get security updates without manual intervention.

Things you should still do as the user:

- Pin the install to a tagged release for production: `git clone --depth 1 --branch v0.1.x https://github.com/vnmoorthy/groundtruth.git ~/.groundtruth`. Tags are immutable in the standard git workflow.
- Enable "Require review from Code Owners" on the `main` branch in GitHub repo settings (Settings → Branches → Branch protection rules → main). The CODEOWNERS file is in place; the toggle to enforce it is a UI-only change.
- Watching the repo on GitHub will email you when new commits land.

**Threat 4: the Stop hook misbehaves and breaks your sessions.**

If the hook script crashes or hangs, Claude Code treats it as an error and surfaces the failure to you. It does not silently corrupt your sessions. The `stop_hook_active` flag (which the hook always checks) prevents infinite block loops.

If you ever need to disable the hook in a hurry, run `claude --bare ...` for one-off sessions, or `groundtruth uninstall` to remove it permanently.

**Threat 5: prompt injection in session transcripts.**

The hook reads `last_assistant_message` and the session JSONL. Both are agent-generated content. Could a malicious assistant message try to influence the hook's behavior?

The hook does **no** evaluation of the assistant text beyond regex matching for completion claims. The regexes are static, defined in `src/detector.mjs`, and reviewable. There is no dynamic code path where injected text becomes executable. The worst a crafted prose can do is suppress the gate (false negative) by phrasing a claim in a way the regex misses, or trigger a false positive. Neither escalates privilege.

## Reporting a vulnerability

If you find a real security issue, do not file a public issue. Email the maintainer or use GitHub's "Report a vulnerability" feature on the repository. Public issues are fine for false positives, missed claims, install bugs, etc.

## What "secure" doesn't mean

The gate is a tool for catching unverified completion claims. It is **not** a security tool. It does not detect secrets in the agent's output, vulnerable code patterns, supply-chain risk, or prompt-injection attempts at the model layer. Use [`netresearch/security-audit-skill`](https://github.com/netresearch/security-audit-skill), [`trailofbits/skills`](https://github.com/trailofbits/skills), or `slavaspitsyn/claude-code-security-hooks` for those concerns. They compose with groundtruth.

## Audit checklist

If you're evaluating whether to install on a machine you care about, the honest checklist:

- [ ] Read `install.sh` end to end (it's short)
- [ ] Confirm zero runtime deps: `cat package.json | jq .dependencies` returns `null`
- [ ] Confirm no network calls in source: `grep -r "fetch\|http\|https\|net\.\|tls\." src/ bin/` returns nothing meaningful
- [ ] Pin to a tagged release rather than `main`
- [ ] Review the registered hook command in `~/.claude/settings.json` after install — it's just `node ~/.groundtruth/bin/groundtruth.mjs hook`
