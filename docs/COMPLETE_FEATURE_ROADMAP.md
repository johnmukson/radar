# Complete Feature Roadmap
## Frontend & Backend Features to Implement

**Date:** January 2025  
**Status:** Planning Phase  
**Priority:** High → Medium → Low

---

## 🎯 EXECUTIVE SUMMARY

### **Critical Features (Must Have):**
1. ❌ **Branch Compartmentalization** - Complete isolation system
2. ❌ **Upload Data Safeguards** - Prevent confusion and errors
3. ❌ **Emergency Assignments Security** - Fix RLS policies
4. ❌ **Branch Selection at Login** - User branch context

### **High Priority Features:**
5. ⚠️ **Emergency Declaration Tracking** - Add missing fields
6. ⚠️ **Stock Upload Branch Auto-Assignment** - Remove branch column requirement
7. ⚠️ **Quantity Validation** - Prevent over-assignment
8. ⚠️ **Dispenser Branch Validation** - Ensure correct branch assignment

### **Medium Priority Features:**
9. ⚠️ **Branch Context Display** - Show branch everywhere
10. ⚠️ **Upload Confirmation Dialogs** - Prevent accidental uploads
11. ⚠️ **Duplicate Detection** - Prevent duplicate stock items
12. ⚠️ **User Branch Management** - Show user's assigned branches

---

## 🔧 BACKEND FEATURES

### **1. Fix Emergency Assignments RLS Policies** ❌ **CRITICAL**

**Priority:** 🔴 **CRITICAL**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 2-3 hours

**Description:**
- Current local migration has `USING (TRUE)` - security vulnerability
- Remote has proper branch isolation policies
- Need to merge remote policies into local migrations

**Tasks:**
- [ ] Update `20250101000007_rls_policies.sql` with remote's emergency assignment policies
- [ ] Add branch isolation to emergency assignments SELECT policy
- [ ] Add branch validation to emergency assignments INSERT policy
- [ ] Add quantity validation to emergency assignments INSERT policy
- [ ] Add dispenser branch validation to emergency assignments INSERT policy
- [ ] Test policies with multiple branches

**Files to Modify:**
- `supabase/migrations/20250101000007_rls_policies.sql`

**Expected Outcome:**
- ✅ Users can only view emergency assignments for their branch
- ✅ Users can only create assignments for their branch
- ✅ Dispensers can only manage their own assignments
- ✅ Proper branch isolation enforced

---

### **2. Fix has_role() Function** ⚠️ **HIGH PRIORITY**

**Priority:** 🟠 **HIGH**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 1-2 hours

**Description:**
- Current function doesn't check branch_id
- Allows users to access data across branches if they have role
- Need to add branch_id parameter

**Tasks:**
- [ ] Update `has_role()` function to accept optional `branch_id` parameter
- [ ] Add branch validation when `branch_id` is provided
- [ ] Update all RLS policies using `has_role()` to include branch checks
- [ ] Create `has_role_for_branch()` helper function if needed
- [ ] Test with multiple branches

**Files to Modify:**
- `supabase/migrations/20250101000002_helper_functions.sql`
- `supabase/migrations/20250101000007_rls_policies.sql`

**Expected Outcome:**
- ✅ `has_role(uid, role, branch_id)` checks branch context
- ✅ Policies properly validate branch access
- ✅ No cross-branch access allowed

---

### **3. Add Emergency Declaration Tracking** ⚠️ **HIGH PRIORITY**

**Priority:** 🟠 **HIGH**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 1 hour

**Description:**
- Frontend doesn't set `emergency_declared_by` when declaring emergency
- Frontend doesn't set `moved_by` in movement history
- Need to enforce these fields

**Tasks:**
- [ ] Add database trigger to auto-set `emergency_declared_by` on emergency declaration
- [ ] Add database trigger to auto-set `moved_by` in movement history
- [ ] Update frontend to set these fields (defense in depth)
- [ ] Add validation to ensure these fields are set
- [ ] Test emergency declaration flow

**Files to Modify:**
- `supabase/migrations/20250101000005_additional_tables.sql` (add triggers)
- `src/components/EmergencyManager.tsx` (frontend)

**Expected Outcome:**
- ✅ All emergency declarations tracked with user
- ✅ All movement history tracked with user
- ✅ Complete audit trail

---

### **4. Add Quantity Validation for Emergency Assignments** ⚠️ **HIGH PRIORITY**

**Priority:** 🟠 **HIGH**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 1-2 hours

**Description:**
- Currently can assign more quantity than available stock
- Need database-level validation
- Need frontend validation

**Tasks:**
- [ ] Add CHECK constraint or trigger to validate `assigned_quantity <= stock_item.quantity`
- [ ] Add database function to check available quantity
- [ ] Update RLS policy to validate quantity before insert
- [ ] Add frontend validation before assignment
- [ ] Add error handling for quantity validation failures
- [ ] Test with various quantity scenarios

**Files to Modify:**
- `supabase/migrations/20250101000005_additional_tables.sql` (add constraint/trigger)
- `src/components/EmergencyManager.tsx` (frontend validation)

**Expected Outcome:**
- ✅ Cannot assign more than available quantity
- ✅ Clear error messages when quantity exceeds available
- ✅ Frontend prevents invalid assignments

---

### **5. Add Dispenser Branch Validation** ⚠️ **HIGH PRIORITY**

**Priority:** 🟠 **HIGH**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 1-2 hours

**Description:**
- Currently can assign dispensers from different branches
- Need to validate dispenser has access to stock item's branch
- Need database-level validation

**Tasks:**
- [ ] Add database function to validate dispenser branch access
- [ ] Update RLS policy to validate dispenser branch before insert
- [ ] Add frontend validation to filter dispensers by branch
- [ ] Update EmergencyManager to use branch_id instead of branch name
- [ ] Test with dispensers from different branches

**Files to Modify:**
- `supabase/migrations/20250101000007_rls_policies.sql` (add validation)
- `src/components/EmergencyManager.tsx` (frontend validation)

**Expected Outcome:**
- ✅ Cannot assign dispensers from different branches
- ✅ Frontend only shows dispensers from same branch
- ✅ Clear error messages for invalid assignments

---

### **6. Add Stock Item Branch Validation on Update** ⚠️ **MEDIUM PRIORITY**

**Priority:** 🟡 **MEDIUM**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 1 hour

**Description:**
- Current UPDATE policy's USING clause doesn't check branch
- Allows users to update stock from any branch if they have role
- Need to add branch check to USING clause

**Tasks:**
- [ ] Update stock_items UPDATE policy USING clause
- [ ] Add branch validation to USING clause
- [ ] Test with users from different branches
- [ ] Verify branch isolation enforced

**Files to Modify:**
- `supabase/migrations/20250101000007_rls_policies.sql`

**Expected Outcome:**
- ✅ Users can only update stock from their assigned branch
- ✅ Proper branch isolation enforced

---

### **7. Add Missing Views from Remote** ⚠️ **MEDIUM PRIORITY**

**Priority:** 🟡 **MEDIUM**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 3-4 hours

**Description:**
- Remote has 13 views, local has 1
- Frontend might depend on these views
- Need to check which views are used and add them

**Tasks:**
- [ ] Check which views frontend uses
- [ ] Add `complete_dispenser_tasks_view` if needed
- [ ] Add `dispenser_tasks_summary` if needed
- [ ] Add other views as needed
- [ ] Test views with sample data

**Files to Create/Modify:**
- `supabase/migrations/20250101000006_views.sql` (add views)
- Frontend code (check usage)

**Expected Outcome:**
- ✅ All views frontend needs are available
- ✅ Views work correctly with branch isolation

---

### **8. Add Duplicate Stock Item Prevention** ⚠️ **MEDIUM PRIORITY**

**Priority:** 🟡 **MEDIUM**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 1-2 hours

**Description:**
- Currently can upload duplicate stock items
- Need to detect duplicates (product_name + branch_id + expiry_date)
- Need to handle duplicates (update vs skip)

**Tasks:**
- [ ] Add UNIQUE constraint or check for duplicates
- [ ] Create function to detect duplicates
- [ ] Add frontend duplicate detection before upload
- [ ] Add reconciliation mode (update existing vs skip)
- [ ] Add preview showing duplicates
- [ ] Test with duplicate data

**Files to Modify:**
- `supabase/migrations/20250101000003_core_tables.sql` (add constraint)
- `src/components/StockUpload.tsx` (frontend detection)

**Expected Outcome:**
- ✅ Duplicates detected before upload
- ✅ Preview shows duplicates
- ✅ User can choose update or skip
- ✅ Clear feedback on duplicate handling

---

### **9. Add Stock Movement History Branch Validation** ⚠️ **LOW PRIORITY**

**Priority:** 🟢 **LOW**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 1 hour

**Description:**
- Movement history SELECT policy doesn't check stock_item.branch_id
- Only checks from_branch_id and to_branch_id
- Emergency declarations have NULL branches, so users can't see them

**Tasks:**
- [ ] Add stock_item.branch_id check to movement history SELECT policy
- [ ] Handle NULL branch cases (emergency declarations)
- [ ] Test with emergency declarations
- [ ] Test with normal movements

**Files to Modify:**
- `supabase/migrations/20250101000007_rls_policies.sql`

**Expected Outcome:**
- ✅ Users can see movement history for their branch
- ✅ Emergency declarations visible to users
- ✅ Proper branch isolation

---

## 🎨 FRONTEND FEATURES

### **1. Branch Context System** ❌ **CRITICAL**

**Priority:** 🔴 **CRITICAL**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 4-6 hours

**Description:**
- Create branch context provider
- Store selected branch in context + localStorage
- Provide branch to all components
- Handle branch switching

**Tasks:**
- [ ] Create `src/contexts/BranchContext.tsx`
- [ ] Create `src/hooks/useUserBranches.tsx`
- [ ] Create `src/pages/BranchSelection.tsx`
- [ ] Update `src/pages/Auth.tsx` to redirect to branch selection
- [ ] Update `src/pages/Index.tsx` to check branch selection
- [ ] Update all components to use branch context
- [ ] Add branch context display to header/sidebar
- [ ] Test with single and multiple branches

**Files to Create:**
- `src/contexts/BranchContext.tsx`
- `src/hooks/useUserBranches.tsx`
- `src/pages/BranchSelection.tsx`

**Files to Modify:**
- `src/pages/Auth.tsx`
- `src/pages/Index.tsx`
- `src/components/AppSidebar.tsx`
- All query components

**Expected Outcome:**
- ✅ Users select branch after login
- ✅ Branch context available everywhere
- ✅ All queries filter by branch
- ✅ Branch displayed prominently

---

### **2. Stock Upload Branch Auto-Assignment** ❌ **CRITICAL**

**Priority:** 🔴 **CRITICAL**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 2-3 hours

**Description:**
- Remove branch column requirement from Excel
- Auto-assign selected branch to all items
- Ignore branch column if present (show warning)
- Show branch context prominently

**Tasks:**
- [ ] Update `StockUpload.tsx` to use branch context
- [ ] Remove branch column requirement
- [ ] Auto-assign selected branch to all items
- [ ] Detect branch column in Excel (show warning)
- [ ] Add branch context banner
- [ ] Update Excel template documentation
- [ ] Test with various Excel files

**Files to Modify:**
- `src/components/StockUpload.tsx`
- `src/components/stock-manager/StockFileUpload.tsx`
- `src/components/dormant-stock/DormantStockFileUpload.tsx`

**Expected Outcome:**
- ✅ Excel template no longer requires branch column
- ✅ All items auto-assigned to selected branch
- ✅ Warning shown if branch column detected
- ✅ Clear branch context displayed

---

### **3. Upload Confirmation Dialogs** ⚠️ **HIGH PRIORITY**

**Priority:** 🟠 **HIGH**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 2-3 hours

**Description:**
- Add confirmation dialog before upload
- Show preview of what will be uploaded
- Show branch context prominently
- Require explicit confirmation

**Tasks:**
- [ ] Create upload preview component
- [ ] Show item count, branch, new vs existing items
- [ ] Add confirmation dialog
- [ ] Show warnings (branch column, duplicates, etc.)
- [ ] Add cancel/confirm buttons
- [ ] Test with various scenarios

**Files to Modify:**
- `src/components/StockUpload.tsx`
- `src/components/stock-manager/StockFileUpload.tsx`

**Expected Outcome:**
- ✅ Preview shown before upload
- ✅ Branch context displayed prominently
- ✅ User must confirm before upload
- ✅ Prevents accidental uploads

---

### **4. Emergency Manager Branch Validation** ⚠️ **HIGH PRIORITY**

**Priority:** 🟠 **HIGH**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 2-3 hours

**Description:**
- Filter dispensers by branch_id instead of branch name
- Validate dispenser has access to stock item's branch
- Add quantity validation before assignment
- Set emergency_declared_by and moved_by fields

**Tasks:**
- [ ] Update `EmergencyManager.tsx` to use branch_id
- [ ] Filter dispensers by branch_id
- [ ] Add quantity validation before assignment
- [ ] Set `emergency_declared_by` when declaring emergency
- [ ] Set `moved_by` in movement history
- [ ] Add error handling for validation failures
- [ ] Test with multiple branches

**Files to Modify:**
- `src/components/EmergencyManager.tsx`

**Expected Outcome:**
- ✅ Only dispensers from same branch shown
- ✅ Quantity validated before assignment
- ✅ All emergency declarations tracked
- ✅ All movements tracked

---

### **5. Branch Context Display** ⚠️ **MEDIUM PRIORITY**

**Priority:** 🟡 **MEDIUM**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 2-3 hours

**Description:**
- Show selected branch prominently everywhere
- Add branch badge/indicator to header
- Show branch in sidebar
- Show branch in all pages

**Tasks:**
- [ ] Add branch context banner to header
- [ ] Add branch badge to sidebar
- [ ] Show branch in all pages
- [ ] Add branch switcher (if multiple branches)
- [ ] Style branch indicators consistently
- [ ] Test with different branches

**Files to Modify:**
- `src/components/AppSidebar.tsx`
- `src/components/Header.tsx` (if exists)
- All page components

**Expected Outcome:**
- ✅ Branch context always visible
- ✅ Cannot miss which branch user is in
- ✅ Clear visual indicators

---

### **6. Duplicate Detection in Upload** ⚠️ **MEDIUM PRIORITY**

**Priority:** 🟡 **MEDIUM**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 2-3 hours

**Description:**
- Detect duplicates before upload
- Show preview of duplicates
- Allow user to choose: update existing or skip
- Show summary of actions

**Tasks:**
- [ ] Add duplicate detection function
- [ ] Check for existing items (product_name + branch_id + expiry_date)
- [ ] Show preview with duplicates highlighted
- [ ] Add reconciliation mode selector
- [ ] Show summary of new vs updated items
- [ ] Test with duplicate data

**Files to Modify:**
- `src/components/StockUpload.tsx`
- `src/components/stock-manager/StockFileUpload.tsx`

**Expected Outcome:**
- ✅ Duplicates detected before upload
- ✅ Preview shows duplicates
- ✅ User can choose update or skip
- ✅ Clear summary of actions

---

### **7. User Branch Management UI** ⚠️ **MEDIUM PRIORITY**

**Priority:** 🟡 **MEDIUM**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 2-3 hours

**Description:**
- Show user's assigned branches in profile
- Allow viewing branch information
- Show branch switching option (if multiple branches)
- Display branch roles

**Tasks:**
- [ ] Create user profile/branch management page
- [ ] Show user's assigned branches
- [ ] Show branch information (code, name, region)
- [ ] Show roles per branch
- [ ] Add branch switching UI (requires re-authentication)
- [ ] Test with single and multiple branches

**Files to Create:**
- `src/pages/UserProfile.tsx` or update existing profile

**Files to Modify:**
- `src/hooks/useUserBranches.tsx`

**Expected Outcome:**
- ✅ Users can see their assigned branches
- ✅ Users can view branch information
- ✅ Clear branch management UI

---

### **8. Upload Error Handling** ⚠️ **LOW PRIORITY**

**Priority:** 🟢 **LOW**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 1-2 hours

**Description:**
- Better error messages for upload failures
- Show which rows failed and why
- Add retry mechanism
- Save failed items for review

**Tasks:**
- [ ] Improve error messages
- [ ] Show row-level errors
- [ ] Add retry mechanism for failed items
- [ ] Save failed items for review
- [ ] Test with various error scenarios

**Files to Modify:**
- `src/components/StockUpload.tsx`
- `src/components/stock-manager/StockFileUpload.tsx`

**Expected Outcome:**
- ✅ Clear error messages
- ✅ Row-level error details
- ✅ Retry mechanism available
- ✅ Better user experience

---

### **9. Branch Selection UI Improvements** ⚠️ **LOW PRIORITY**

**Priority:** 🟢 **LOW**  
**Status:** ❌ Not Implemented  
**Estimated Time:** 1-2 hours

**Description:**
- Beautiful branch selection page
- Card-based selection UI
- Show branch code, name, region
- Auto-select if single branch

**Tasks:**
- [ ] Design beautiful branch selection UI
- [ ] Create card-based selection
- [ ] Show branch information
- [ ] Auto-select if single branch
- [ ] Add loading states
- [ ] Test with various scenarios

**Files to Modify:**
- `src/pages/BranchSelection.tsx`

**Expected Outcome:**
- ✅ Beautiful, intuitive branch selection
- ✅ Clear branch information
- ✅ Smooth user experience

---

## 📋 IMPLEMENTATION PRIORITY

### **Phase 1: Critical Security & Core Features (Week 1)**
1. ✅ Fix Emergency Assignments RLS Policies
2. ✅ Fix has_role() Function
3. ✅ Branch Context System
4. ✅ Stock Upload Branch Auto-Assignment

### **Phase 2: High Priority Features (Week 2)**
5. ✅ Emergency Declaration Tracking
6. ✅ Quantity Validation
7. ✅ Dispenser Branch Validation
8. ✅ Upload Confirmation Dialogs
9. ✅ Emergency Manager Branch Validation

### **Phase 3: Medium Priority Features (Week 3)**
10. ✅ Branch Context Display
11. ✅ Duplicate Detection
12. ✅ Stock Item Branch Validation on Update
13. ✅ User Branch Management UI

### **Phase 4: Low Priority Features (Week 4)**
14. ✅ Stock Movement History Branch Validation
15. ✅ Missing Views from Remote
16. ✅ Upload Error Handling
17. ✅ Branch Selection UI Improvements

---

## 🎯 SUCCESS CRITERIA

### **Security:**
- ✅ No cross-branch access allowed
- ✅ All RLS policies enforce branch isolation
- ✅ All emergency assignments secure
- ✅ All data access validated

### **Data Integrity:**
- ✅ No duplicate stock items
- ✅ Quantity validation prevents over-assignment
- ✅ Branch validation prevents wrong assignments
- ✅ Complete audit trail

### **User Experience:**
- ✅ Clear branch context everywhere
- ✅ No confusion about which branch
- ✅ Smooth upload process
- ✅ Clear error messages

### **Functionality:**
- ✅ All features work with branch isolation
- ✅ 20 branches can operate independently
- ✅ Users can upload their individual lists
- ✅ No data confusion

---

## 📊 ESTIMATED TIMELINE

- **Phase 1:** 1 week (Critical features)
- **Phase 2:** 1 week (High priority)
- **Phase 3:** 1 week (Medium priority)
- **Phase 4:** 1 week (Low priority)

**Total:** ~4 weeks for complete implementation

---

## 🔄 NEXT STEPS

1. ✅ **Review this roadmap** - Prioritize features
2. ✅ **Start with Phase 1** - Critical security features
3. ✅ **Test thoroughly** - After each phase
4. ✅ **Deploy incrementally** - After each phase tested

---

**Roadmap Created:** 2025-01-XX  
**Status:** Ready for Implementation

