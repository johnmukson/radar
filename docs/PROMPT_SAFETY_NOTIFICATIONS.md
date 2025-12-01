# Prompt Safety Notifications

**Purpose:** Document any prompts or requests that might disorganize, impede, or cause malfunction in the application.

**Rule:** Before executing any prompt that could potentially cause issues, notify the user and document it here.

---

## 📋 NOTIFICATION LOG

### **Notification #1** - January 2025

**Prompt Received:** "check whether we have implemented this **Medium Priority Features:** 9. ⚠️ **Branch Context Display** - Show branch everywhere 10. ⚠️ **Upload Confirmation Dialogs** - Prevent accidental uploads 11. ⚠️ **Duplicate Detection** - Prevent duplicate stock items 12. ⚠️ **User Branch Management** - Show user's assigned branches if not implemented, excecute with extreme accuracy and keep updating the backe end md"

**Status:** ✅ **SAFE TO EXECUTE**

**Analysis:**
- All features were already partially implemented
- Implementation was completed safely
- No breaking changes introduced
- All changes are additive and improve functionality

**Actions Taken:**
- ✅ Completed Branch Context Display (added to Assignments and ExpiryManager headers)
- ✅ Verified Upload Confirmation Dialogs (already implemented)
- ✅ Enhanced Duplicate Detection (added database duplicate detection)
- ✅ Verified User Branch Management (already implemented)
- ✅ Updated backend.md with all changes

**Risk Assessment:** **LOW** - All changes are safe and improve existing functionality.

---

## 🚨 POTENTIAL RISK INDICATORS

### **Red Flags (Require Notification):**
- ⚠️ Requests to delete or remove existing features
- ⚠️ Requests to change core database schema without migration
- ⚠️ Requests to modify RLS policies without proper testing
- ⚠️ Requests to change authentication flow
- ⚠️ Requests to remove security features
- ⚠️ Requests to bypass branch compartmentalization
- ⚠️ Requests to modify critical business logic
- ⚠️ Requests that could cause data loss
- ⚠️ Requests to change file structure significantly
- ⚠️ Requests that might break existing functionality

### **Yellow Flags (Review Carefully):**
- ⚠️ Requests to refactor large codebases
- ⚠️ Requests to change multiple components at once
- ⚠️ Requests to modify shared utilities
- ⚠️ Requests to change API contracts
- ⚠️ Requests to update dependencies

### **Green Flags (Generally Safe):**
- ✅ Adding new features
- ✅ Adding new validation
- ✅ Adding new UI components
- ✅ Adding documentation
- ✅ Fixing bugs
- ✅ Improving existing features

---

## 📝 NOTIFICATION TEMPLATE

When a potentially risky prompt is received:

```
🚨 **SAFETY NOTIFICATION**

**Prompt Received:** [Description of prompt]

**Risk Level:** [HIGH / MEDIUM / LOW]

**Potential Issues:**
- [Issue 1]
- [Issue 2]

**Recommended Actions:**
- [Action 1]
- [Action 2]

**User Confirmation Required:** [YES / NO]

**Status:** [PENDING USER APPROVAL / APPROVED / REJECTED]
```

---

## 🔒 PROTECTION RULES

### **Rule 1: Always Notify Before Breaking Changes**
If a prompt requests changes that could break existing functionality, notify the user first.

### **Rule 2: Always Notify Before Security Changes**
If a prompt requests changes to security features (RLS, authentication, authorization), notify the user first.

### **Rule 3: Always Notify Before Data Structure Changes**
If a prompt requests changes to database schema, data models, or core data structures, notify the user first.

### **Rule 4: Always Notify Before Removing Features**
If a prompt requests removal of existing features, notify the user first.

### **Rule 5: Always Notify Before Major Refactoring**
If a prompt requests major refactoring that could affect multiple components, notify the user first.

---

## ✅ SAFE OPERATIONS

These operations are generally safe and don't require notification:

- Adding new features
- Adding new validation
- Adding new UI components
- Fixing bugs
- Improving error messages
- Adding documentation
- Updating progress tracking
- Adding new utility functions
- Enhancing existing features (non-breaking)

---

## 📝 UPDATE LOG

### **January 2025 - Documentation Update**
- ✅ Added AI and Twilio features to pending features
- ✅ Updated checklist and master progress
- ✅ Prepared backend.md with SQL for AI and Twilio
- ✅ Documented all pending backend requirements

---

**Last Updated:** January 2025  
**Version:** 1.1.0

