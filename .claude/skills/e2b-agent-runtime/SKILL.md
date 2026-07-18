```markdown
# e2b-agent-runtime Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions used in the `e2b-agent-runtime` TypeScript codebase. You'll learn about file naming, import/export styles, commit message conventions, and how to write and run tests using Vitest. This guide is designed to help you contribute effectively and maintain consistency across the project.

## Coding Conventions

### File Naming
- Use **camelCase** for all filenames.
  - Example: `agentRuntime.ts`, `myHelperFunction.ts`

### Imports
- Use **relative imports** for modules within the project.
  - Example:
    ```typescript
    import { myFunction } from './myHelperFunction';
    ```

### Exports
- Use **named exports** for all modules.
  - Example:
    ```typescript
    // In myHelperFunction.ts
    export function myFunction() { /* ... */ }
    ```

### Commit Messages
- Follow the **conventional commit** format.
- Use the `feat` prefix for new features.
  - Example:
    ```
    feat: add support for agent lifecycle hooks
    ```

## Workflows

### Writing a New Feature
**Trigger:** When adding a new capability or module  
**Command:** `/new-feature`

1. Create a new file using camelCase (e.g., `newFeature.ts`).
2. Use relative imports to include dependencies.
3. Export your functions or classes using named exports.
4. Write a corresponding test file (see Testing Patterns).
5. Commit using the conventional commit format with the `feat` prefix.

### Running Tests
**Trigger:** To verify code correctness before pushing changes  
**Command:** `/run-tests`

1. Ensure your test files are named with the `.test.ts` suffix (e.g., `myFeature.test.ts`).
2. Run the test suite using Vitest:
   ```bash
   npx vitest
   ```
3. Review the output and fix any failing tests.

### Adding a Test
**Trigger:** When adding or updating functionality  
**Command:** `/add-test`

1. Create a new test file or update an existing one, using the pattern `*.test.ts`.
2. Write tests using Vitest's syntax:
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { myFunction } from './myFunction';

   describe('myFunction', () => {
     it('should return true', () => {
       expect(myFunction()).toBe(true);
     });
   });
   ```
3. Run `/run-tests` to verify your tests pass.

## Testing Patterns

- **Framework:** Vitest
- **Test file pattern:** `*.test.ts`
- **Example:**
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { myFunction } from './myFunction';

  describe('myFunction', () => {
    it('returns expected result', () => {
      expect(myFunction()).toBe(true);
    });
  });
  ```

## Commands
| Command        | Purpose                                   |
|----------------|-------------------------------------------|
| /new-feature   | Start a new feature following conventions  |
| /run-tests     | Run the Vitest test suite                 |
| /add-test      | Add or update a test file                 |
```