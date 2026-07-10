#!/usr/bin/env python3
"""PreToolUse guardrail hook — turns the Always/Ask/Never lines from AGENT_RULES.md
from hope into a hard line.

A soft prompt rule ("never modify auth") is a request the model can rationalise past.
This hook intercepts the tool call *before* it runs and decides allow / ask / deny on
the actual file path or command. Stdlib only, no deps.

Protocol: Claude Code sends a PreToolUse event as JSON on stdin
(`tool_name`, `tool_input`). We reply with a PreToolUse permission decision on stdout.
  - allow  -> exit 0, no output (let normal permission flow continue)
  - ask    -> JSON permissionDecision "ask"  (force a human confirmation)
  - deny   -> JSON permissionDecision "deny" (block outright, reason shown to model)

Wire up in .claude/settings.json (see AGENT_RULES.md > Guardrails):
  {
    "hooks": {
      "PreToolUse": [
        { "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash",
          "hooks": [{ "type": "command",
                      "command": "python3 .claude/hooks/guardrails.py" }] }
      ]
    }
  }

Tune the three lists below per project — they are deliberately conservative defaults.
"""
import fnmatch
import json
import re
import sys

# --- NEVER: writing these is blocked outright. Secrets never belong in the tree. ---
# Matched against basename (so they catch the file wherever it lives).
NEVER_BASENAME = [
    ".env", ".env.*", "*.env",  # real env files: .env, .env.local, prod.env (exceptions below)
    "*.pem", "*.key", "*.p12", "*.keystore", "*.pfx",
    "id_rsa", "id_ed25519", "id_dsa", "id_ecdsa",
    "credentials.json", "credentials", "secrets.*", "*.secret",
]
# Explicit exceptions — these are safe to write even though they match NEVER above.
NEVER_EXCEPT_BASENAME = [".env.example", ".env.sample", ".env.template", ".env.dist"]

# --- ASK: pause for explicit human sign-off before touching these. ---
# A path matches if any of its directory segments is in ASK_SEGMENT, or its
# basename matches an ASK_BASENAME glob, or the full path matches an ASK_PATH glob.
ASK_SEGMENT = ["migrations", "migration"]
ASK_BASENAME = [
    "*auth*.py", "*auth*.js", "*auth*.ts", "*auth*.tsx",
    "*schema*.sql", "schema.prisma", "*.migration.*",
]
ASK_PATH = [
    "*/auth/*", "*/authentication/*",
    "*/.claude/settings.json",
    "*/.github/workflows/*",
]

# --- Bash: best-effort secondary net. The file-tool guard above is the real line; ---
# arbitrary shell can't be fully parsed, so we match a few high-signal shapes only.
BASH_DENY = [
    # redirect into a secret file:  > .env   >> config/.env   | tee .env
    r"(>>?|\btee\b)\s+[^\s|&;]*\.env(?!\.(example|sample|template|dist))\b",
    r"(>>?|\btee\b)\s+[^\s|&;]*\.(pem|key|p12|keystore|pfx)\b",
    # catastrophic recursive delete of a root-ish target
    r"\brm\s+(-\w*\s+)*-\w*[rR]\w*\s+(-\w+\s+)*(/|~|\$HOME|/\*|\.\s*$)",
]
BASH_ASK = [
    r"\bgit\s+push\b.*(--force\b|-f\b)",          # force-push
    r"\bgit\s+push\b.*\borigin\s+(main|master)\b", # push straight to default branch
    r"\b(sed\s+-i|tee)\b[^\n]*\b(auth|schema|migration)\w*",  # in-place edit of guarded files
]


def _basename(path: str) -> str:
    return path.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]


def _glob_any(name: str, patterns) -> bool:
    return any(fnmatch.fnmatch(name, p) for p in patterns)


def decide_file(path: str):
    if not path:
        return ("allow", "")
    p = path.replace("\\", "/")
    base = _basename(p)
    segs = p.split("/")

    # NEVER (with exceptions)
    if _glob_any(base, NEVER_EXCEPT_BASENAME):
        pass  # explicitly allowed override of a NEVER match
    elif _glob_any(base, NEVER_BASENAME):
        return ("deny",
                f"Blocked by guardrail: '{base}' looks like a secret/credential file. "
                "Secrets load from the environment at runtime — never write them into the "
                "tree. Only a value-less .env.example belongs in git.")

    # ASK
    if any(s in ASK_SEGMENT for s in segs) \
            or _glob_any(base, ASK_BASENAME) \
            or _glob_any(p, ASK_PATH):
        return ("ask",
                f"Guardrail checkpoint: '{base}' is a protected path (auth / schema / "
                "migrations / CI / settings). Confirm this change is intended before it runs.")

    return ("allow", "")


def decide_bash(command: str):
    cmd = command or ""
    for pat in BASH_DENY:
        if re.search(pat, cmd):
            return ("deny",
                    "Blocked by guardrail: command writes to a secret file or performs a "
                    "destructive recursive delete. Refusing to run it.")
    for pat in BASH_ASK:
        if re.search(pat, cmd):
            return ("ask",
                    "Guardrail checkpoint: command force-pushes, writes to a default branch, "
                    "or edits a guarded file in place. Confirm before it runs.")
    return ("allow", "")


def emit(decision: str, reason: str):
    if decision == "allow":
        sys.exit(0)  # stay out of the way; normal permission flow continues
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,        # "ask" | "deny"
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def main():
    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)  # malformed event -> fail open, never wedge the agent

    tool = event.get("tool_name", "")
    ti = event.get("tool_input", {}) or {}

    if tool == "Bash":
        emit(*decide_bash(ti.get("command", "")))
    elif tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        path = ti.get("file_path") or ti.get("notebook_path") or ""
        emit(*decide_file(path))

    sys.exit(0)  # any other tool -> allow


if __name__ == "__main__":
    main()
