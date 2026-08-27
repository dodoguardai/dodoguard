import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import yaml from 'js-yaml';
import { getConfigDirectoryPath, setConfigDirectoryPath } from '../../../src/util/config/manage';
import { writeDodoguardConfig } from '../../../src/util/config/writer';

jest.mock('fs');
jest.mock('os');
jest.mock('../../../backend/src/envars', () => ({
  getEnvString: jest.fn().mockReturnValue(undefined),
}));
jest.mock('../../../backend/src/logger', () => ({
  warn: jest.fn(),
}));

describe('config management', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(os.homedir).mockReturnValue('/home/user');
    setConfigDirectoryPath(undefined);
  });

  describe('getConfigDirectoryPath', () => {
    it('should return default config path when no custom path set', () => {
      setConfigDirectoryPath(undefined);
      jest.mocked(fs.existsSync).mockReturnValue(false);
      const configPath = getConfigDirectoryPath();
      expect(configPath).toBe(path.join('/home/user', '.dodoguard'));
    });

    it('should create directory if createIfNotExists is true', () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);
      setConfigDirectoryPath(undefined);
      getConfigDirectoryPath(true);
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/home/user', '.dodoguard'), {
        recursive: true,
      });
    });

    it('should not create directory if it already exists', () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      getConfigDirectoryPath(true);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('setConfigDirectoryPath', () => {
    it('should set custom config directory path', () => {
      const customPath = '/custom/path';
      setConfigDirectoryPath(customPath);
      const configPath = getConfigDirectoryPath();
      expect(configPath).toBe(customPath);
    });

    it('should handle undefined path', () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);
      setConfigDirectoryPath(undefined);
      const configPath = getConfigDirectoryPath();
      expect(configPath).toBe(path.join('/home/user', '.dodoguard'));
    });
  });

  describe('writeDodoguardConfig', () => {
    const outputPath = 'config.yaml';

    it('should write config with schema comment', () => {
      const config = {
        description: 'test config',
        prompts: ['prompt1'],
      };

      writeDodoguardConfig(config, outputPath);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        outputPath,
        `# yaml-language-server: $schema=https://dodoguard.dev/config-schema.json\n${yaml.dump(config)}`,
      );
    });

    it('should write config with header comments', () => {
      const config = {
        description: 'test config',
      };
      const headerComments = ['Comment 1', 'Comment 2'];

      writeDodoguardConfig(config, outputPath, headerComments);

      const expectedContent =
        `# yaml-language-server: $schema=https://dodoguard.dev/config-schema.json\n` +
        `# Comment 1\n# Comment 2\n${yaml.dump(config)}`;

      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, expectedContent);
    });

    it('should handle empty config', () => {
      const config = {};
      const result = writeDodoguardConfig(config, outputPath);
      expect(result).toEqual({});
    });

    it('should order config keys', () => {
      const config = {
        tests: ['test1'],
        description: 'desc',
        prompts: ['prompt1'],
      };

      const result = writeDodoguardConfig(config, outputPath);

      expect(Object.keys(result)[0]).toBe('description');
      expect(Object.keys(result)[1]).toBe('prompts');
      expect(Object.keys(result)[2]).toBe('tests');
    });

    it('should handle empty yaml content', () => {
      const yamlDumpSpy = jest.spyOn(yaml, 'dump').mockReturnValue('');
      const config = { description: 'test' };
      const result = writeDodoguardConfig(config, outputPath);
      expect(result).toEqual(config);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      yamlDumpSpy.mockRestore();
    });
  });
});
