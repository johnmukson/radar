# Backend Changelog

This document accumulates approved backend changes to be applied in batched deployments. Each entry should be atomic, reference the originating feature, and include SQL/migration notes.

---

## Conventions
- One section per change with an ID: BACKEND-YYYYMMDD-XX
- Link to originating feature doc in `docs/`
- Include: Summary, Impact, SQL/Migration, RLS, Rollback

---

## Entries

### BACKEND-20250106-02 — Emergency Declaration Tracking

- **Feature:** `docs/FEATURE_EMERGENCY_DECLARATION_TRACKING.md`
- **Priority:** High
- **Status:** ✅ Complete
- **Summary:** Add complete tracking for emergency declarations and stock movements. Implement database triggers to auto-set `emergency_declared_by`, `moved_by`, and `assigned_by` fields for complete audit trail.
- **Impact:**
  - All emergency declarations now tracked with user ID
  - All stock movements now tracked with user ID
  - All emergency assignments now tracked with user ID
  - Complete audit trail for all emergency operations
- **SQL/Migration:** `supabase/migrations/20250106000001_emergency_declaration_tracking.sql`
- **Functions Created:**
  - `public.auto_set_emergency_declared_by()` - Auto-sets emergency declaration tracking
  - `public.auto_set_moved_by()` - Auto-sets movement tracking
  - `public.auto_set_assigned_by()` - Auto-sets assignment tracking
- **Triggers Created:**
  - `trigger_auto_set_emergency_declared_by` on `stock_items`
  - `trigger_auto_set_moved_by` on `stock_movement_history`
  - `trigger_auto_set_assigned_by` on `emergency_assignments`
- **Frontend Changes:**
  - Updated `EmergencyManager.tsx` to set tracking fields
  - Added `useAuth` hook to get current user
- **Testing Required:**
  - Verify emergency declarations track user
  - Verify stock movements track user
  - Verify emergency assignments track user
  - Verify triggers work as backup (defense in depth)
- **Rollback:** Drop triggers and functions if needed
- **Notes:** This provides complete audit trail for emergency operations. Triggers ensure fields are always set even if frontend forgets.

---

### BACKEND-20250106-01 — Emergency Assignments RLS Security Fix
- **Feature:** `docs/FEATURE_EMERGENCY_ASSIGNMENTS_SECURITY.md`
- **Priority:** Critical (Security)
- **Status:** Ready for Application
- **Summary:** Fix critical security vulnerability where any authenticated user could view all emergency assignments across all branches. Implement proper branch isolation and role-based access control.
- **Impact:** 
  - Users without proper roles will lose access to emergency assignments
  - Dispensers will now see their assignments (previously couldn't)
  - Branch admins can only see their branch's assignments (previously saw all)
- **SQL/Migration:** `supabase/migrations/20250106000000_fix_emergency_assignments_rls.sql`
- **RLS Changes:**
  - Drop insecure `USING (TRUE)` policy
  - Add branch-scoped policies for system admins, regional managers, branch admins, branch managers
  - Add dispenser self-management policy
  - Add inventory assistant full management policy (branch-scoped, full CRUD)
  - Add doctor read-only policy (branch-scoped, view only)
- **Testing Required:**
  - Verify system admins can access all assignments
  - Verify branch admins can only access their branch's assignments
  - Verify dispensers can only access their own assignments
  - Verify inventory assistants can manage assignments for their branches (full CRUD)
  - Verify doctors can only view assignments for their branches (read-only)
  - Verify users without roles cannot access any assignments
- **Rollback:** Restore old policies from migration history if needed
- **Notes:** This is a critical security fix and should be applied immediately.

---

### BACKEND-20250106-02 — Branch Compartmentalization Alignment
- Feature: `docs/BRANCH_COMPARTMENTALIZATION_COMPLETE.md`
- Summary: Ensure helper functions and RLS remain compatible with frontend branch filtering.
- Impact: None (no new tables). Clarify usage of `has_write_access` and `has_role`.
- SQL/Migration: No new DDL required at this time.
- RLS: Verified policies for `stock_items`, `weekly_tasks`, `emergency_assignments` already enforce branch isolation by `branch_id`.
- Rollback: N/A
