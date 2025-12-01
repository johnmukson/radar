# Backend Update Template

Use this template to propose backend changes tied to a feature. Add proposals to `UPDATE_QUEUE.md`. After review/approval, entries move to `CHANGELOG.md` for batched application.

---

## Metadata
- Title: [Short title]
- ID: BACKEND-YYYYMMDD-XX
- Feature Doc: docs/[FEATURE_NAME].md
- Owner: [Name]
- Status: Draft / Approved / Applied

---

## Summary
Brief description of the backend change and business rationale.

---

## Impact Analysis
- Affected tables: [list]
- Affected functions/triggers: [list]
- RLS adjustments: [yes/no + details]
- Backwards compatibility: [yes/no]

---

## SQL / Migration Plan
```sql
-- Place SQL DDL/DML here (idempotent if possible)
```

### Ordering / Dependencies
- [ ] Depends on: [other migrations]

---

## Rollback Plan
```sql
-- SQL to revert changes
```

---

## Validation / Tests
- [ ] Local `supabase db reset` passes
- [ ] `supabase gen types` reflects changes
- [ ] RLS verified for affected roles

---

## Notes
Additional context or risks.
