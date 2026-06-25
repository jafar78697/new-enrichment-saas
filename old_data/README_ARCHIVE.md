# Archive Guide

This folder stores files that are not part of the normal coding or deployment path.

## Folders

- `root-tests/`
  One-off root-level test and debug scripts.

- `apps-api/`
  Old API-side test files and temporary runtime files such as logs and pid files.

- `apps-web/`
  Old frontend notes, temporary scripts, and local dev log files.

- `docs-archive/`
  Historical debugging notes, status reports, and older fix writeups.

## Rules

- Do not read this folder first when doing normal product work.
- Restore files from here only if a task explicitly needs old behavior or historical debugging context.
- If a file is moved here, it should not be required by deploy, build, or runtime.

## Good Practice

- Keep active docs in root or app folders.
- Keep one-off experiments, old reports, and temporary scripts here.
