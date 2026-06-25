# Code Agent Cleanup Notes

Purpose: identify safe future cleanup that can reduce coding-agent credit use without risking runtime behavior.

## High-Value Next Cleanup

### 1. Generated duplicates inside `src/`

There are many generated files committed beside source files, especially in:

- `apps/api/src/**/*.js`
- `apps/api/src/**/*.d.ts`
- `apps/api/src/**/*.js.map`
- `packages/*/src/**/*.js`
- `packages/*/src/**/*.d.ts`
- `packages/*/src/**/*.js.map`

These usually duplicate nearby `.ts` files and cause agents to read extra files by mistake.

## Safe strategy

1. Verify runtime imports use TypeScript entrypoints or compiled `dist/` output, not generated files inside `src/`.
2. Remove generated `.js/.d.ts/.map` from `src/` only after confirming build and deploy still work.
3. Keep either:
   - source in `src/` and build output in `dist/`, or
   - source only, if build artifacts are not meant to be committed.

## Do Not Blindly Delete Yet

Do not mass-delete these files without checking:

- `apps/api/src/index.js`
- `apps/api/src/routes/*.js`
- `apps/api/src/plugins/*.js`
- `packages/auth/src/*`
- `packages/contracts/src/*`
- `packages/db/src/*`
- `packages/queue/src/*`

Some scripts or production startup paths may still rely on committed JS.

## Immediate Agent Rule

Until cleanup is completed:

- prefer `.ts` and `.tsx` files first
- ignore `.js.map`
- ignore `.d.ts` unless type output itself is the task
- open committed `.js` only when there is no `.ts` source for that module
