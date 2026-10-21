# Issue tracker: GitHub

Issues and specs live at https://github.com/Nikhilsharma-lab/Lane/issues. Use `gh` with explicit `--repo Nikhilsharma-lab/Lane`.

- Before creating, search existing issues for the same work.
- Create with `gh issue create --repo Nikhilsharma-lab/Lane --title '<title>' --body-file <file> --label <label>`; use a UTF-8 file for multiline bodies.
- Read with `gh issue view <number> --repo Nikhilsharma-lab/Lane --json number,title,body,labels,comments`.
- List with `gh issue list --repo Nikhilsharma-lab/Lane --state open --json number,title,url,labels`.
- Update using `gh issue edit`; use `--body-file` for descriptions and `--add-label`/`--remove-label` for workflow changes.
- After publishing, verify the saved body and labels and return the issue URL.
- Apply the vocabulary in `docs/agents/triage-labels.md`. A tracking label does not override Lane's scoped implementation or release approvals.

**PRs as a request surface: no.**

“Publish to the issue tracker” means create a GitHub issue. “Fetch the relevant ticket” means read that issue. Product UI continues to call its domain objects Requests.
