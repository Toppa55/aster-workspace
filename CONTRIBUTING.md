# Contributing

1. Create a focused branch from `main`.
2. Keep provider-specific behavior in `lib/ai/adapters.ts`.
3. Add tests for provider payload or event-shape changes.
4. Run `pnpm test`, `pnpm exec tsc --noEmit`, and `pnpm build`.
5. Scan the complete diff and Git history for secrets before opening a pull request.

Coding-project responses must never place full source files in chat. New AI operations must use the structured workspace protocol and remain reviewable before application.
