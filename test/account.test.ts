import { getAuthor, getUserEmail, setUserEmail } from '../backend/src/globalConfig/accounts';
import {
  readGlobalConfig,
  writeGlobalConfigPartial,
} from '../backend/src/globalConfig/globalConfig';

jest.mock('../backend/src/globalConfig/globalConfig', () => ({
  writeGlobalConfig: jest.fn(),
  readGlobalConfig: jest.fn(),
  writeGlobalConfigPartial: jest.fn(),
}));

describe('accounts module', () => {
  beforeEach(() => {
    delete process.env.DODOGUARD_AUTHOR;
    jest.resetModules();
  });

  describe('getUserEmail', () => {
    it('should return the email from global config', () => {
      jest.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });
      expect(getUserEmail()).toBe('test@example.com');
    });

    it('should return null if no email is set in global config', () => {
      jest.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      expect(getUserEmail()).toBeNull();
    });
  });

  describe('setUserEmail', () => {
    it('should write the email to global config', () => {
      const writeGlobalConfigSpy = jest.mocked(writeGlobalConfigPartial);
      setUserEmail('test@example.com');
      expect(writeGlobalConfigSpy).toHaveBeenCalledWith({ account: { email: 'test@example.com' } });
    });
  });

  describe('getAuthor', () => {
    it('should return the author from environment variable', () => {
      process.env.DODOGUARD_AUTHOR = 'envAuthor';
      expect(getAuthor()).toBe('envAuthor');
    });

    it('should return the email if environment variable is not set', () => {
      jest.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });
      expect(getAuthor()).toBe('test@example.com');
    });

    it('should return null if neither environment variable nor email is set', () => {
      jest.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      expect(getAuthor()).toBeNull();
    });
  });
});
