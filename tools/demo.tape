# tools/demo.tape
#
# vhs (https://github.com/charmbracelet/vhs) script to record the
# 30-second groundtruth demo as an animated GIF.
#
# Install vhs:    brew install charmbracelet/tap/vhs
# Record:         vhs tools/demo.tape
# Output:         docs/demo.gif (used in README hero and Twitter post)
#
# This script drives a terminal session that:
#   1. Shows the install line and runs install
#   2. Audits the included unverified-claim fixture (3 findings)
#   3. Audits the verified-claim fixture (0 findings)
#   4. Demonstrates the Stop hook returning a block payload
#   5. Closes with the playground URL
#
# Total runtime ~30 seconds. The output GIF should be embedded at the
# top of README.md and used in launch posts.

Output docs/demo.gif

Set FontSize 14
Set Width 1200
Set Height 720
Set Theme "GitHub Dark Default"
Set Padding 20
Set TypingSpeed 35ms

# Scene 1: install (no actual network spend; we cd into the repo and show what we would run)
Type "# groundtruth — refuse to let Claude Code say done without evidence"
Enter
Sleep 800ms
Type "# install:"
Enter
Type "# curl -fsSL https://raw.githubusercontent.com/vnmoorthy/groundtruth/main/install.sh | bash"
Enter
Sleep 1500ms
Ctrl+L

# Scene 2: audit a synthetic unverified claim → 3 findings
Type "# audit a session where the agent claimed Done with no test"
Enter
Type "groundtruth check test/fixtures/unverified-claim.jsonl"
Enter
Sleep 4000ms
Ctrl+L

# Scene 3: audit a verified turn → 0 findings, 1 verified
Type "# now a session where the agent ran the test in the same turn"
Enter
Type "groundtruth check test/fixtures/verified-claim.jsonl"
Enter
Sleep 3000ms
Ctrl+L

# Scene 4: simulate the live Stop hook block
Type "# what happens when the gate fires:"
Enter
Type "echo '{\"hook_event_name\":\"Stop\",\"transcript_path\":\"test/fixtures/unverified-claim.jsonl\",\"stop_hook_active\":false,\"last_assistant_message\":\"Implemented it. Done.\"}' | groundtruth hook | jq"
Enter
Sleep 4000ms
Ctrl+L

# Scene 5: closing card
Type "# 1k turns audited in 27ms. zero deps. MIT."
Enter
Sleep 600ms
Type "# try in your browser, no install: vnmoorthy.github.io/groundtruth/playground.html"
Enter
Sleep 2500ms
