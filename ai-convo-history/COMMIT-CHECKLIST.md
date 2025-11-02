# Commit Checklist - Best Practices

## Pre-Commit Verification

Before committing any TypeScript/JavaScript changes, always run these checks:

### 1. TypeScript Compilation Check

```bash
# From backend directory
cd backend
npx tsc --noEmit
```

This will check for TypeScript compilation errors without emitting files.

**Why**: Catches type errors before they break the build or runtime.

### 2. Build Verification

```bash
# If project has a build script
npm run build
```

**Why**: Ensures the entire project builds successfully.

### 3. Server Startup Test

```bash
# Start the dev server
npm run dev

# Watch for:
# - ✅ "Server running on port 3000"
# - ❌ Any compilation errors or crashes
```

**Why**: Confirms the server can start and run without errors.

### 4. Quick Functionality Test

- Hit a key API endpoint
- Verify no runtime errors in logs
- Check that recent changes work as expected

## Common Issues Caught by Pre-Commit Checks

1. **Escaped characters in template strings**
   - Backticks, quotes, etc. that confuse the parser

2. **Missing imports**
   - New code uses types/functions not imported

3. **Type mismatches**
   - Incorrect types passed to functions
   - Wrong interface properties

4. **Syntax errors**
   - Unterminated strings
   - Missing brackets/parentheses

## Quick Pre-Commit Command

For convenience, create an alias or script:

```bash
# In package.json
"scripts": {
  "precommit-check": "tsc --noEmit && npm run build"
}

# Usage
npm run precommit-check && git commit -m "Your message"
```

## Emergency: Already Committed Broken Code?

If you've already committed code with compilation errors:

```bash
# Option 1: Amend the previous commit (if not pushed)
# Fix the errors, then:
git add -A
git commit --amend --no-edit

# Option 2: Create a fix commit (if already pushed)
# Fix the errors, then:
git add -A
git commit -m "Fix TypeScript compilation errors"
```

## Lessons Learned

**2025-10-31**: Committed code with escaped backticks in template strings that caused TypeScript compilation errors. Server failed to start. Had to fix in follow-up session.

**Resolution**: Remove escaped backticks, verify server starts, then commit again.

**Takeaway**: Always run `npx tsc --noEmit` or start the dev server before committing TypeScript changes.
