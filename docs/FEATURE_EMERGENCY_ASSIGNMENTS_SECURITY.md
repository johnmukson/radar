# Emergency Assignments Security - RLS Policy Fix

**Status:** 🚧 **In Progress**  
**Priority:** Critical (Security)  
**Date Started:** January 2025

---

## 📋 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Security Issues Identified](#security-issues-identified)
3. [Current State Analysis](#current-state-analysis)
4. [Proposed Solution](#proposed-solution)
5. [Implementation Details](#implementation-details)
6. [Files Modified/Created](#files-modifiedcreated)
7. [Testing Checklist](#testing-checklist)
8. [Backend Changes](#backend-changes)

---

## 📖 OVERVIEW

Fix critical security vulnerabilities in Emergency Assignments RLS policies. The current policies allow any authenticated user to view ALL emergency assignments across all branches, which is a serious data breach risk. This feature implements proper branch isolation and role-based access control.

---

## 🔒 SECURITY ISSUES IDENTIFIED

### **Critical Issue #1: Unrestricted View Access** ❌
**Current Policy:**
```sql
CREATE POLICY "View emergency assignments" ON public.emergency_assignments
  FOR SELECT
  USING (TRUE);  -- ❌ ANYONE can view ALL emergency assignments!
```

**Risk:**
- Users can see emergency assignments from branches they don't have access to
- Violates branch compartmentalization
- Data privacy breach
- Potential competitive intelligence leak

### **Critical Issue #2: Missing Branch Validation** ❌
**Current Policy:**
```sql
CREATE POLICY "Admins insert emergency assignments" ON public.emergency_assignments
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'admin')
  );
```

**Risk:**
- Admins can create emergency assignments for ANY branch
- No validation that the stock_item belongs to a branch the admin has access to
- Can assign dispensers from one branch to items in another branch

### **Missing Feature: Dispenser Self-Management** ⚠️
**Current State:**
- Dispensers cannot view or manage their own emergency assignments
- Only admins can manage assignments

**Impact:**
- Poor user experience
- Dispensers cannot see their assigned tasks
- Cannot update status or complete assignments

---

## 🔍 CURRENT STATE ANALYSIS

### **Local Database Policies (BEFORE):**
```sql
-- ❌ SECURITY ISSUE: Anyone can view all assignments
CREATE POLICY "View emergency assignments" ON public.emergency_assignments
  FOR SELECT
  USING (TRUE);

-- ✅ OK: Only admins can insert
CREATE POLICY "Admins insert emergency assignments" ON public.emergency_assignments
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

-- ✅ OK: Only admins can update
CREATE POLICY "Admins update emergency assignments" ON public.emergency_assignments
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

-- ✅ OK: Only admins can delete
CREATE POLICY "Admins delete emergency assignments" ON public.emergency_assignments
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'branch_system_admin')
    OR public.has_role(auth.uid(), 'admin')
  );
```

### **Remote Database Policies (REFERENCE - BETTER):**
```sql
-- ✅ GOOD: Branch system admins can manage assignments for their branches
create policy "Branch system admins can manage emergency assignments for their"
  on "public"."emergency_assignments"
  as permissive
  for all
  to public
using (
  public.has_role(auth.uid(), 'branch_system_admin'::public.app_role) 
  AND (stock_item_id IN (
    SELECT stock_items.id
    FROM public.stock_items
    WHERE (stock_items.branch_id IN (
      SELECT user_roles.branch_id
      FROM public.user_roles
      WHERE (user_roles.user_id = auth.uid())
    ))
  ))
);

-- ✅ GOOD: Dispensers can manage their own assignments
create policy "Dispensers can manage their own emergency assignments"
  on "public"."emergency_assignments"
  as permissive
  for all
  to public
using ((dispenser_id = auth.uid()));
```

---

## ✅ PROPOSED SOLUTION

### **New RLS Policies:**

1. **System Admins & Regional Managers:** Can view/manage all emergency assignments
2. **Branch System Admins:** Can view/manage emergency assignments for their assigned branches only
3. **Branch Managers:** Can view/manage emergency assignments for their assigned branches only
4. **Dispensers:** Can view/manage their own emergency assignments only
5. **Inventory Assistants:** Can view/manage emergency assignments for their assigned branches (full CRUD)
6. **Doctors:** Can view emergency assignments for their assigned branches (read-only)
7. **Admin Role (Legacy):** Can view/manage emergency assignments for their assigned branches only
8. **Other Roles:** No access (unless explicitly granted)

### **Policy Structure:**
- **SELECT:** Branch-filtered access based on role
- **INSERT:** Branch validation + role check
- **UPDATE:** Branch validation + role check (or own assignment for dispensers)
- **DELETE:** Branch validation + role check (or own assignment for dispensers)

---

## 🔧 IMPLEMENTATION DETAILS

### **Policy 1: System Admins & Regional Managers (Full Access)**
```sql
CREATE POLICY "System admins and regional managers can manage all emergency assignments"
  ON public.emergency_assignments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'regional_manager')
  );
```

### **Policy 2: Branch System Admins (Branch-Scoped)**
```sql
CREATE POLICY "Branch system admins can manage emergency assignments for their branches"
  ON public.emergency_assignments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_system_admin')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_system_admin')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
    )
  );
```

### **Policy 3: Branch Managers (Branch-Scoped)**
```sql
CREATE POLICY "Branch managers can manage emergency assignments for their branches"
  ON public.emergency_assignments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_manager')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_manager')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'
    )
  );
```

### **Policy 4: Dispensers (Own Assignments Only)**
```sql
CREATE POLICY "Dispensers can manage their own emergency assignments"
  ON public.emergency_assignments
  FOR ALL
  USING (dispenser_id = auth.uid())
  WITH CHECK (dispenser_id = auth.uid());
```

### **Policy 5: Inventory Assistants (View Only, Branch-Scoped)**
```sql
CREATE POLICY "Inventory assistants can view emergency assignments for their branches"
  ON public.emergency_assignments
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'inventory_assistant')
    AND EXISTS (
      SELECT 1
      FROM public.stock_items si
      INNER JOIN public.user_roles ur ON ur.branch_id = si.branch_id
      WHERE si.id = emergency_assignments.stock_item_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'inventory_assistant'
    )
  );
```

---

## 📁 FILES MODIFIED/CREATED

### **Created Files:**
- [ ] `supabase/migrations/[timestamp]_fix_emergency_assignments_rls.sql` - New migration to fix RLS policies

### **Modified Files:**
- [ ] `supabase/migrations/20250101000007_rls_policies.sql` - Will be replaced by new migration

---

## 🧪 TESTING CHECKLIST

### **Security Testing:**
- [ ] System admin can view/manage all emergency assignments
- [ ] Regional manager can view/manage all emergency assignments
- [ ] Branch system admin can ONLY view/manage assignments for their branches
- [ ] Branch manager can ONLY view/manage assignments for their branches
- [ ] Dispenser can ONLY view/manage their own assignments
- [ ] Inventory assistant can view AND manage assignments for their branches (full CRUD)
- [ ] Doctor can ONLY view assignments for their branches (read-only)
- [ ] Doctor cannot create, update, or delete emergency assignments
- [ ] User with no role cannot view any emergency assignments
- [ ] User from Branch A cannot view assignments from Branch B

### **Functional Testing:**
- [ ] Create emergency assignment (admin)
- [ ] Create emergency assignment (branch admin) - only for their branch
- [ ] Create emergency assignment (inventory assistant) - only for their branch
- [ ] Update emergency assignment (admin)
- [ ] Update emergency assignment (dispenser) - only their own
- [ ] Update emergency assignment (inventory assistant) - only for their branch
- [ ] Doctor cannot create/update/delete emergency assignments (read-only)
- [ ] Delete emergency assignment (admin)
- [ ] View emergency assignments list (filtered by branch/role)
- [ ] Complete emergency assignment (dispenser)

### **Edge Cases:**
- [ ] Multi-branch user sees assignments from all their branches
- [ ] User removed from branch loses access immediately
- [ ] Assignment for non-existent stock item (should fail)
- [ ] Assignment for stock item from different branch (should fail)

---

## 🔄 BACKEND CHANGES

### **Migration File:**
- **File:** `supabase/migrations/[timestamp]_fix_emergency_assignments_rls.sql`
- **Action:** Drop old policies, create new secure policies
- **Rollback:** Can restore old policies if needed

### **Breaking Changes:**
- ⚠️ **Users without proper roles will lose access to emergency assignments**
- ⚠️ **Dispensers will now see their assignments (previously couldn't)**
- ⚠️ **Branch admins can only see their branch's assignments (previously saw all)**

### **Migration Strategy:**
1. Drop existing policies
2. Create new policies with proper branch isolation
3. Test with different user roles
4. Verify no data access issues

---

## ⚠️ KNOWN ISSUES

_None currently_

---

## 🚀 FUTURE ENHANCEMENTS

- [ ] Add audit logging for emergency assignment access
- [ ] Add notification when assignment is created/updated
- [ ] Add bulk assignment operations
- [ ] Add assignment templates

---

**Last Updated:** January 2025  
**Version:** 1.0.0

