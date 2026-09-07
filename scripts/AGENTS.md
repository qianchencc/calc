# Usage export

- Deduplicate with production's `(request_id, api_key_id)` identity; grouping by user instead loses distinct billed requests across keys.
- Group identity is the four explicit IDs in TIERS, not multiplier equality across all groups.
- Use actual_cost as recorded. Priority billing can differ from total_cost multiplied by rate_multiplier.
- Publish only after a complete successful read; retained samples keep their original dates. Read ../deploy/README.md before server changes.
