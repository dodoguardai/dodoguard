import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';

/**
 * Represents the structure of package.json file
 */
interface PackageJson {
  license: string;
  version: string;
  description: string;
}

/**
 * Represents the structure of CITATION.cff file
 */
interface Citation {
  'cff-version': string;
  message: string;
  authors: Array<{
    'family-names': string;
    'given-names': string;
  }>;
  title: string;
  version: string;
  'date-released': string;
  url: string;
  'repository-code': string;
  license: string;
  type: string;
  description: string;
  keywords: string[];
}

/**
 * Creates a default Citation object with information from package.json
 * @param packageJson - The parsed package.json file
 * @returns A default Citation object
 */
const createDefaultCitation = (packageJson: PackageJson): Citation => ({
  'cff-version': '1.2.0',
  message: 'If you use this software, please cite it as below.',
  authors: [
    {
      'family-names': 'DodoGuard',
      'given-names': 'Team',
    },
  ],
  title: 'DodoGuard',
  version: packageJson.version,
  'date-released': new Date().toISOString().slice(0, 10),
  url: 'https://dodoguard.dev',
  'repository-code': 'https://codeup.aliyun.com/69b679747b6e0a0129627a77/zhian.git',
  license: packageJson.license,
  type: 'software',
  description: packageJson.description,
  keywords: ['llm', 'evaluation', 'evals', 'testing', 'prompt-engineering', 'red-team'],
});

/**
 * Fetches the release date for a specific version from GitHub
 * @param version The version to fetch the release date for
 * @returns Promise<string> The release date in ISO format, or null if not found
 */
async function getReleaseDate(_version: string): Promise<string | null> {
  return null;
}

/**
 * Updates the CITATION.cff file with the latest information from package.json and GitHub
 * @throws {Error} If there's an issue reading or writing files
 */
export const updateCitation = async (): Promise<void> => {
  const packageJsonPath: string = path.join(__dirname, '../package.json');
  const citationPath: string = path.join(__dirname, '../CITATION.cff');

  const packageJson: PackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  let citation: Citation;
  try {
    citation = yaml.load(fs.readFileSync(citationPath, 'utf8')) as Citation;
  } catch {
    citation = createDefaultCitation(packageJson);
  }
  citation['version'] = packageJson.version;

  const releaseDate = await getReleaseDate(packageJson.version);
  citation['date-released'] = releaseDate || new Date().toISOString().slice(0, 10);

  fs.writeFileSync(citationPath, yaml.dump(citation, { lineWidth: -1 }));

  console.log('CITATION.cff file has been updated.');
};

if (require.main === module) {
  updateCitation().catch(console.error);
}
