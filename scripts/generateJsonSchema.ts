import { zodToJsonSchema } from 'zod-to-json-schema';
import { UnifiedConfigSchema } from '../backend/src/types';

const jsonSchema = zodToJsonSchema(UnifiedConfigSchema, 'DodoGuardConfigSchema');

console.log(JSON.stringify(jsonSchema, null, 2));
