---
name: release
description: Release workflow - bump version, verify docs/tests, build, commit, tag
disable-model-invocation: true
argument-hint: "[patch|minor|major]"
---

# Release Workflow

Execute a complete release cycle for this project.

## Steps

### 1. Determine Version

- Read current version from `package.json`
- Based on `$ARGUMENTS` (patch/minor/major), calculate new version
- If no argument, suggest based on changes (features = minor, fixes = patch)
- Show: "Version bump: X.Y.Z -> A.B.C"

### 2. Bump Version in All Files

Update version in:
- `package.json`
- `src/banner.txt` (@version line)
- `src/main.js` (@version line if present)

### 3. Verify Documentation

Check that these reflect the new version and changes:
- `CHANGELOG.md` - has section for new version with changes
- `README.md` - version number updated

If missing, update them. Ask user to confirm changes look correct.

### 4. Verify Test Coverage

Review changes made this session. Confirm tests exist for:
- New functions/features
- Changed behavior
- Edge cases

Report any gaps.

### 5. Run Tests

```bash
npm run test:all
```

If tests fail, STOP and report failures. Do not proceed.

### 6. Build

```bash
npm run build
```

If build fails, STOP and report errors. Do not proceed.

### 7. Git Commit

- Run `git status` and `git diff --stat`
- Propose a commit message summarizing changes
- Ask user to approve or edit the message
- Once approved, stage all changes and commit

### 8. Create Tag

```bash
git tag X.Y.Z
```

### 9. Push

Push the commit and the tag yourself (SSH auth works from the Bash tool through Pageant):
```bash
git push
git push origin X.Y.Z
```

Then check that the tag-triggered `Release` workflow succeeded with `gh run list --limit 3`.

## Notes

- Stop immediately on any test or build failure
- Always wait for user approval before committing
- Push the commit and tag yourself after the commit is approved; do not hand the push back to the user
