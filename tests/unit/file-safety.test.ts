import { describe, expect, it } from 'vitest';
import {
  FileSafetyError,
  getAbsoluteRepositoryPath,
  sanitizeRepositoryPath,
} from '../../src/security/file-safety.js';

describe('File Safety Validator Unit Tests', () => {
  it('should allow valid relative paths inside repository', () => {
    expect(sanitizeRepositoryPath('src/index.ts')).toBe('src/index.ts');
    expect(sanitizeRepositoryPath('package.json')).toBe('package.json');
    expect(getAbsoluteRepositoryPath('src/index.ts')).toBe('/workspace/repository/src/index.ts');
  });

  it('should reject path traversal attempts', () => {
    try {
      sanitizeRepositoryPath('../outside.txt');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(FileSafetyError);
      expect(err.code).toBe('PATH_TRAVERSAL');
    }
  });

  it('should reject .git directory access', () => {
    try {
      sanitizeRepositoryPath('.git/config');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(FileSafetyError);
      expect(err.code).toBe('FORBIDDEN_PATH');
    }
  });

  it('should reject secret files (.env, private keys)', () => {
    try {
      sanitizeRepositoryPath('.env');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(FileSafetyError);
      expect(err.code).toBe('SECRET_FILE_BLOCKED');
    }
  });
});
