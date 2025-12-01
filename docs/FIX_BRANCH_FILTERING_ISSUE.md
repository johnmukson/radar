# Fix Branch Filtering Issue - Critical Bug Fix

**Status:** 🚧 **In Progress**  
**Priority:** 🔴 **CRITICAL**  
**Date:** January 2025

---

## 🐛 ISSUE DESCRIPTION

**Problem:**
- When switching branches, the system still shows data from the previously selected branch (Munyonyo)
- System admins and regional managers see ALL data from ALL branches instead of the selected branch
- Components don't re-fetch data when branch changes
- Branch compartmentalization not working correctly

**User Report:**
> "the system was working with Munyonyo and it had only munyonyo branches when i tried to switch branches, it still show munyonyo data regardless of the branch and yet other branches have not yet uploaded their data"

---

## 🔍 ROOT CAUSE ANALYSIS

### **Issue 1: Missing useEffect Dependencies** ❌
**Problem:** Components have empty dependency arrays `[]`, so they only fetch once on mount and don't re-fetch when branch changes.

**Affected Files:**
- `src/components/StockList.tsx` - Line 120: `useEffect(() => { fetchStockItems() }, [])`
- `src/components/dashboard/HighValueItems.tsx` - Line 104: `useEffect(() => { ... }, [])`

**Fix:** Add `selectedBranch` to dependency array.

---

### **Issue 2: System Admin/Regional Manager Bypass** ❌
**Problem:** Logic says "Filter by branch unless system admin or regional manager", which means they see ALL data from ALL branches.

**Current Logic:**
```typescript
if (!isSystemAdmin && !isRegionalManager && selectedBranch) {
  query = query.eq('branch_id', selectedBranch.id)
}
```

**Problem:** System admins and regional managers bypass this filter, so they see all branches' data mixed together.

**Fix:** Always filter by selected branch. System admins/regional managers can switch branches to see different branches, but should see one branch at a time.

---

### **Issue 3: Branch Context Not Triggering Re-fetch** ❌
**Problem:** Even when branch context updates, components don't re-fetch because:
1. Missing dependencies in useEffect
2. Components might be caching data
3. No mechanism to force refresh on branch change

**Fix:** 
1. Add `selectedBranch` to all useEffect dependencies
2. Clear data when branch changes
3. Force re-fetch when branch changes

---

## ✅ SOLUTION

### **1. Fix StockList.tsx**

**Changes:**
- Add `selectedBranch` to useEffect dependencies
- Always filter by selected branch (remove system admin bypass)
- Clear stock items when no branch selected

**Code:**
```typescript
useEffect(() => {
  fetchStockItems()
}, [selectedBranch]) // ✅ Re-fetch when branch changes

const fetchStockItems = async () => {
  if (!selectedBranch) {
    setStockItems([])
    setLoading(false)
    return
  }

  // ✅ ALWAYS filter by selected branch
  let query = supabase
    .from('stock_items')
    .select('*')
    .eq('branch_id', selectedBranch.id) // ✅ Always filter
}
```

---

### **2. Fix EmergencyManager.tsx**

**Changes:**
- Always filter stock items by selected branch
- Always filter dispensers by selected branch
- Always filter emergency assignments by selected branch
- Remove system admin/regional manager bypass

**Code:**
```typescript
const fetchData = useCallback(async () => {
  if (!selectedBranch) {
    setStockItems([])
    setDispensers([])
    setEmergencyAssignments([])
    return
  }

  // ✅ ALWAYS filter by selected branch
  let stockQuery = supabase.from('stock_items').select('*')
    .eq('branch_id', selectedBranch.id)

  let dispensersQuery = supabase.from('users_with_roles')
    .select('user_id, name, phone, branch_id, branch_name')
    .eq('role', 'dispenser')
    .eq('branch_id', selectedBranch.id) // ✅ Always filter

  // ✅ ALWAYS filter assignments by branch
  let filteredAssignments = (assignmentsResponse.data || []).filter(assignment => 
    assignment.stock_item?.branch_id === selectedBranch.id
  )
}, [selectedBranch]) // ✅ Re-fetch when branch changes
```

---

### **3. Fix All Other Components**

**Components to Fix:**
- ✅ `src/components/StockList.tsx`
- ✅ `src/components/EmergencyManager.tsx`
- ✅ `src/components/ProductSearch.tsx`
- ✅ `src/components/dashboard/HighValueItems.tsx`
- ✅ `src/components/WeeklyTasksTable.tsx`
- ⏭️ `src/pages/ExpiryManager.tsx`
- ⏭️ `src/pages/Assignments.tsx` (if exists)
- ⏭️ Any other data-fetching components

**Pattern to Apply:**
1. Remove system admin/regional manager bypass
2. Always filter by `selectedBranch.id`
3. Add `selectedBranch` to useEffect dependencies
4. Clear data when no branch selected

---

## 🔧 IMPLEMENTATION

### **Step 1: Update StockList.tsx** ✅
- [x] Fix useEffect dependencies
- [x] Always filter by selected branch
- [x] Clear data when no branch

### **Step 2: Update EmergencyManager.tsx** ✅
- [x] Fix fetchData to always filter by branch
- [x] Remove system admin bypass
- [x] Filter assignments by branch

### **Step 3: Update ProductSearch.tsx** ✅
- [x] Always filter by selected branch
- [x] Remove system admin bypass

### **Step 4: Update HighValueItems.tsx** ✅
- [x] Fix useEffect dependencies
- [x] Always filter by selected branch

### **Step 5: Update WeeklyTasksTable.tsx** ✅
- [x] Always filter by selected branch
- [x] Fix useEffect dependencies

### **Step 6: Update ExpiryManager.tsx** ⏭️
- [ ] Fix useEffect dependencies
- [ ] Always filter by selected branch
- [ ] Remove system admin bypass

### **Step 7: Update Assignments.tsx** ⏭️
- [ ] Check if file exists
- [ ] Fix if exists

### **Step 8: Test** ⏭️
- [ ] Test branch switching
- [ ] Verify data changes when branch changes
- [ ] Test with system admin
- [ ] Test with regular user
- [ ] Test with multiple branches

---

## 📋 TESTING CHECKLIST

### **Branch Switching:**
- [ ] Switch from Branch A to Branch B
- [ ] Verify StockList shows Branch B data only
- [ ] Verify EmergencyManager shows Branch B data only
- [ ] Verify all components show Branch B data only
- [ ] Switch back to Branch A
- [ ] Verify data changes back to Branch A

### **System Admin/Regional Manager:**
- [ ] System admin selects Branch A → sees Branch A data only
- [ ] System admin switches to Branch B → sees Branch B data only
- [ ] Regional manager selects Branch A → sees Branch A data only
- [ ] Regional manager switches to Branch B → sees Branch B data only

### **Data Isolation:**
- [ ] Branch A user sees only Branch A data
- [ ] Branch B user sees only Branch B data
- [ ] No cross-branch data leakage
- [ ] Empty branches show empty data (not other branches' data)

---

## 🚨 BREAKING CHANGES

**Behavior Change:**
- ⚠️ System admins and regional managers will now see data for the selected branch only (not all branches)
- ⚠️ They must switch branches to see different branches' data
- ✅ This is the CORRECT behavior for proper compartmentalization

**Migration:**
- No database changes required
- Frontend-only changes
- Users will need to select a branch if they haven't already

---

## 📝 FILES TO MODIFY

### **Completed:**
- ✅ `src/components/StockList.tsx`
- ✅ `src/components/EmergencyManager.tsx`
- ✅ `src/components/ProductSearch.tsx`
- ✅ `src/components/dashboard/HighValueItems.tsx`
- ✅ `src/components/WeeklyTasksTable.tsx`

### **Pending:**
- ⏭️ `src/pages/ExpiryManager.tsx`
- ⏭️ Any other data-fetching components

---

## 🎯 EXPECTED OUTCOME

After fix:
- ✅ Switching branches shows data for the selected branch only
- ✅ System admins see selected branch data (can switch to see other branches)
- ✅ Regional managers see selected branch data (can switch to see other branches)
- ✅ All components re-fetch when branch changes
- ✅ Proper branch compartmentalization enforced
- ✅ No data confusion between branches

---

**Last Updated:** January 2025  
**Status:** 🚧 **In Progress**

