# Commit message instructions

- Format each message as `<type>(<scope>): <imperative summary>`. Choose a concise scope that identifies the affected area.
- Prefix scopes with their area, such as `api-health`, `api-routes`, `bot-music`, `bot-commands`, `dashboard-assets`, `database-models`, `docs-setup`, `deps-runtime`, `ci-release`, or `release`. Use the same `<area>-<feature>` pattern for other scopes, choosing a concise feature name that identifies the change.
- For a change spanning multiple types or scopes, keep one message and join complete `<type>(<scope>)` pairs with `+`, for example `feat(api-health)+fix(bot-music): improve service reliability`.
- Choose a suitable type: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, or `revert`.
- Keep the subject concise: aim for one line and never exceed two lines or 72 characters total. Use imperative mood and no trailing period.
- A body is optional; include one only when it adds useful context for a breaking change, migration, non-obvious intent, or linked issue. Wrap body lines at 72 characters.
- For version bumps only, use a simple one-line subject, then list changed packages under `Packages updated:`. Do not add extra explanation.
- Do not mention AI authorship or restate obvious details from the diff.
