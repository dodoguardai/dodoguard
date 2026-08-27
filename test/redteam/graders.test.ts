import { getGraderById } from '../../backend/src/redteam/graders';
import { AegisGrader } from '../../backend/src/redteam/plugins/aegis';
import { AsciiSmugglingGrader } from '../../backend/src/redteam/plugins/asciiSmuggling';
import { BeavertailsGrader } from '../../backend/src/redteam/plugins/beavertails';
import { BiasGrader } from '../../backend/src/redteam/plugins/bias';
import { FinancialCalculationErrorPluginGrader } from '../../backend/src/redteam/plugins/financial/financialCalculationError';
import { FinancialComplianceViolationPluginGrader } from '../../backend/src/redteam/plugins/financial/financialComplianceViolation';
import { FinancialDataLeakagePluginGrader } from '../../backend/src/redteam/plugins/financial/financialDataLeakage';
import { FinancialHallucinationPluginGrader } from '../../backend/src/redteam/plugins/financial/financialHallucination';
import { FinancialSycophancyPluginGrader } from '../../backend/src/redteam/plugins/financial/financialSycophancy';
import {
  HarmfulGrader,
  MisinformationDisinformationGrader,
} from '../../backend/src/redteam/plugins/harmful/graders';
import { MCPPluginGrader } from '../../backend/src/redteam/plugins/mcp';
import { MedicalAnchoringBiasPluginGrader } from '../../backend/src/redteam/plugins/medical/medicalAnchoringBias';
import { MedicalHallucinationPluginGrader } from '../../backend/src/redteam/plugins/medical/medicalHallucination';
import { OffTopicPluginGrader } from '../../backend/src/redteam/plugins/offTopic';
import { PlinyGrader } from '../../backend/src/redteam/plugins/pliny';
import { ToolDiscoveryGrader } from '../../backend/src/redteam/plugins/toolDiscovery';
import { ToxicChatGrader } from '../../backend/src/redteam/plugins/toxicChat';
import { UnsafeBenchGrader } from '../../backend/src/redteam/plugins/unsafebench';

describe('getGraderById', () => {
  it('should return correct grader for valid ID', () => {
    const asciiGrader = getGraderById('dodoguard:redteam:ascii-smuggling');
    expect(asciiGrader).toBeInstanceOf(AsciiSmugglingGrader);

    const beavertailsGrader = getGraderById('dodoguard:redteam:beavertails');
    expect(beavertailsGrader).toBeInstanceOf(BeavertailsGrader);

    const harmfulGrader = getGraderById('dodoguard:redteam:harmful');
    expect(harmfulGrader).toBeInstanceOf(HarmfulGrader);

    const unsafebenchGrader = getGraderById('dodoguard:redteam:unsafebench');
    expect(unsafebenchGrader).toBeInstanceOf(UnsafeBenchGrader);

    const plinyGrader = getGraderById('dodoguard:redteam:pliny');
    expect(plinyGrader).toBeInstanceOf(PlinyGrader);

    const toxicChatGrader = getGraderById('dodoguard:redteam:toxic-chat');
    expect(toxicChatGrader).toBeInstanceOf(ToxicChatGrader);

    const financialCalculationGrader = getGraderById(
      'dodoguard:redteam:financial:calculation-error',
    );
    expect(financialCalculationGrader).toBeInstanceOf(FinancialCalculationErrorPluginGrader);

    const financialComplianceGrader = getGraderById(
      'dodoguard:redteam:financial:compliance-violation',
    );
    expect(financialComplianceGrader).toBeInstanceOf(FinancialComplianceViolationPluginGrader);

    const financialDataLeakageGrader = getGraderById('dodoguard:redteam:financial:data-leakage');
    expect(financialDataLeakageGrader).toBeInstanceOf(FinancialDataLeakagePluginGrader);

    const financialHallucinationGrader = getGraderById('dodoguard:redteam:financial:hallucination');
    expect(financialHallucinationGrader).toBeInstanceOf(FinancialHallucinationPluginGrader);

    const financialSycophancyGrader = getGraderById('dodoguard:redteam:financial:sycophancy');
    expect(financialSycophancyGrader).toBeInstanceOf(FinancialSycophancyPluginGrader);

    const aegisGrader = getGraderById('dodoguard:redteam:aegis');
    expect(aegisGrader).toBeInstanceOf(AegisGrader);

    const mcpGrader = getGraderById('dodoguard:redteam:mcp');
    expect(mcpGrader).toBeInstanceOf(MCPPluginGrader);

    const medicalAnchoringBiasGrader = getGraderById('dodoguard:redteam:medical:anchoring-bias');
    expect(medicalAnchoringBiasGrader).toBeInstanceOf(MedicalAnchoringBiasPluginGrader);

    const medicalHallucinationGrader = getGraderById('dodoguard:redteam:medical:hallucination');
    expect(medicalHallucinationGrader).toBeInstanceOf(MedicalHallucinationPluginGrader);

    const offTopicGrader = getGraderById('dodoguard:redteam:off-topic');
    expect(offTopicGrader).toBeInstanceOf(OffTopicPluginGrader);

    const toolDiscoveryGrader = getGraderById('dodoguard:redteam:tool-discovery');
    expect(toolDiscoveryGrader).toBeInstanceOf(ToolDiscoveryGrader);

    const biasGrader = getGraderById('dodoguard:redteam:bias');
    expect(biasGrader).toBeInstanceOf(BiasGrader);
  });

  it('should return specific grader for misinformation-disinformation', () => {
    const misinformationGrader = getGraderById(
      'dodoguard:redteam:harmful:misinformation-disinformation',
    );
    expect(misinformationGrader).toBeInstanceOf(MisinformationDisinformationGrader);
    expect(misinformationGrader?.id).toBe(
      'dodoguard:redteam:harmful:misinformation-disinformation',
    );
  });

  it('should return harmful grader for IDs starting with dodoguard:redteam:harmful', () => {
    const specificHarmfulGrader = getGraderById('dodoguard:redteam:harmful:specific-type');
    expect(specificHarmfulGrader).toBeInstanceOf(HarmfulGrader);

    const anotherHarmfulGrader = getGraderById('dodoguard:redteam:harmful:another-type');
    expect(anotherHarmfulGrader).toBeInstanceOf(HarmfulGrader);
  });

  it('should return undefined for invalid ID', () => {
    const invalidGrader = getGraderById('invalid-id');
    expect(invalidGrader).toBeUndefined();
  });

  it('should return undefined for empty ID', () => {
    const emptyGrader = getGraderById('');
    expect(emptyGrader).toBeUndefined();
  });
});
