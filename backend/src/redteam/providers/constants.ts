import { getEnvFloat } from '../../envars';

export const ATTACKER_MODEL = 'gpt-4.1-2025-04-14';

export const ATTACKER_MODEL_SMALL = 'gpt-4.1-mini-2025-04-14';

export const TEMPERATURE = getEnvFloat('DODOGUARD_JAILBREAK_TEMPERATURE')
  ? getEnvFloat('DODOGUARD_JAILBREAK_TEMPERATURE')
  : 0.7;
