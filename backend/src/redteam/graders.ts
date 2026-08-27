import { AegisGrader } from './plugins/aegis';
import { REDTEAM_MEMORY_POISONING_PLUGIN_ID } from './plugins/agentic/constants';
import { MemoryPoisoningPluginGrader } from './plugins/agentic/memoryPoisoning';
import { AsciiSmugglingGrader } from './plugins/asciiSmuggling';
import type { RedteamGraderBase } from './plugins/base';
import { BeavertailsGrader } from './plugins/beavertails';
import { BflaGrader } from './plugins/bfla';
import { BiasGrader } from './plugins/bias';
import { BolaGrader } from './plugins/bola';
import { CompetitorsGrader } from './plugins/competitors';
import { CcaGrader } from './plugins/contextComplianceAttack';
import { ContractsGrader } from './plugins/contracts';
import { CoppaGrader } from './plugins/compliance/coppa';
import { CrossSessionLeakGrader } from './plugins/crossSessionLeak';
import { DebugAccessGrader } from './plugins/debugAccess';
import { DivergentRepetitionGrader } from './plugins/divergentRepetition';
import { ExcessiveAgencyGrader } from './plugins/excessiveAgency';
import { FinancialCalculationErrorPluginGrader } from './plugins/financial/financialCalculationError';
import { FinancialComplianceViolationPluginGrader } from './plugins/financial/financialComplianceViolation';
import { FinancialConfidentialDisclosurePluginGrader } from './plugins/financial/financialConfidentialDisclosure';
import { FinancialCounterfactualPluginGrader } from './plugins/financial/financialCounterfactual';
import { FinancialDataLeakagePluginGrader } from './plugins/financial/financialDataLeakage';
import { FinancialDefamationPluginGrader } from './plugins/financial/financialDefamation';
import { FinancialHallucinationPluginGrader } from './plugins/financial/financialHallucination';
import { FinancialImpartialityPluginGrader } from './plugins/financial/financialImpartiality';
import { FinancialMisconductPluginGrader } from './plugins/financial/financialMisconduct';
import { FinancialSycophancyPluginGrader } from './plugins/financial/financialSycophancy';
import { HallucinationGrader } from './plugins/hallucination';
import { HarmbenchGrader } from './plugins/harmbench';
import {
  ChildExploitationGrader,
  CopyrightViolationGrader,
  CybercrimeGrader,
  GraphicContentGrader,
  HarmfulGrader,
  HarmfulPrivacyGrader,
  HateGrader,
  IllegalActivitiesGrader,
  IllegalDrugsGrader,
  IndiscriminateWeaponsGrader,
  InsultsGrader,
  MisinformationDisinformationGrader,
  NonViolentCrimeGrader,
  ProfanityGrader,
  RadicalizationGrader,
  SelfHarmGrader,
  SexCrimeGrader,
  SexualContentGrader,
  SpecializedAdviceGrader,
  UnsafePracticesGrader,
  ViolentCrimeGrader,
} from './plugins/harmful/graders';
import { HijackingGrader } from './plugins/hijacking';
import { ImitationGrader } from './plugins/imitation';
import { IndirectPromptInjectionGrader } from './plugins/indirectPromptInjection';
import { IntentGrader } from './plugins/intent';
import { MCPPluginGrader } from './plugins/mcp';
import { MedicalAnchoringBiasPluginGrader } from './plugins/medical/medicalAnchoringBias';
import { MedicalHallucinationPluginGrader } from './plugins/medical/medicalHallucination';
import { MedicalIncorrectKnowledgePluginGrader } from './plugins/medical/medicalIncorrectKnowledge';
import { MedicalOffLabelUsePluginGrader } from './plugins/medical/medicalOffLabelUse';
import { MedicalPrioritizationErrorPluginGrader } from './plugins/medical/medicalPrioritizationError';
import { MedicalSycophancyPluginGrader } from './plugins/medical/medicalSycophancy';
import { OffTopicPluginGrader } from './plugins/offTopic';
import { OverrelianceGrader } from './plugins/overreliance';
import { PiiGrader } from './plugins/pii';
import { PlinyGrader } from './plugins/pliny';
import { PolicyViolationGrader } from './plugins/policy';
import { PoliticsGrader } from './plugins/politics';
import { PromptExtractionGrader } from './plugins/promptExtraction';
import { RagDocumentExfiltrationGrader } from './plugins/ragDocumentExfiltration';
import { RbacGrader } from './plugins/rbac';
import { ReasoningDosGrader } from './plugins/reasoningDos';
import { ReligionGrader } from './plugins/religion';
import { ShellInjectionGrader } from './plugins/shellInjection';
import { SqlInjectionGrader } from './plugins/sqlInjection';
import { SsrfGrader } from './plugins/ssrf';
import { ToolDiscoveryGrader } from './plugins/toolDiscovery';
import { ToxicChatGrader } from './plugins/toxicChat';
import { UnsafeBenchGrader } from './plugins/unsafebench';
import { UnverifiableClaimsGrader } from './plugins/unverifiableClaims';
import { VLGuardGrader } from './plugins/vlguard';
import { WordplayGrader } from './plugins/wordplay';
import type { RedteamAssertionTypes } from './types';

export const GRADERS: Record<RedteamAssertionTypes, RedteamGraderBase> = {
  [REDTEAM_MEMORY_POISONING_PLUGIN_ID]: new MemoryPoisoningPluginGrader(),
  'dodoguard:redteam:aegis': new AegisGrader(),
  'dodoguard:redteam:ascii-smuggling': new AsciiSmugglingGrader(),
  'dodoguard:redteam:beavertails': new BeavertailsGrader(),
  'dodoguard:redteam:bfla': new BflaGrader(),
  'dodoguard:redteam:bias': new BiasGrader(),
  'dodoguard:redteam:bias:age': new BiasGrader(),
  'dodoguard:redteam:bias:disability': new BiasGrader(),
  'dodoguard:redteam:bias:gender': new BiasGrader(),
  'dodoguard:redteam:bias:race': new BiasGrader(),
  'dodoguard:redteam:bola': new BolaGrader(),
  'dodoguard:redteam:cca': new CcaGrader(),
  'dodoguard:redteam:competitors': new CompetitorsGrader(),
  'dodoguard:redteam:contracts': new ContractsGrader(),
  'dodoguard:redteam:coppa': new CoppaGrader(),
  'dodoguard:redteam:cross-session-leak': new CrossSessionLeakGrader(),
  'dodoguard:redteam:debug-access': new DebugAccessGrader(),
  'dodoguard:redteam:divergent-repetition': new DivergentRepetitionGrader(),
  'dodoguard:redteam:excessive-agency': new ExcessiveAgencyGrader(),
  'dodoguard:redteam:financial:calculation-error': new FinancialCalculationErrorPluginGrader(),
  'dodoguard:redteam:financial:compliance-violation':
    new FinancialComplianceViolationPluginGrader(),
  'dodoguard:redteam:financial:confidential-disclosure':
    new FinancialConfidentialDisclosurePluginGrader(),
  'dodoguard:redteam:financial:counterfactual': new FinancialCounterfactualPluginGrader(),
  'dodoguard:redteam:financial:data-leakage': new FinancialDataLeakagePluginGrader(),
  'dodoguard:redteam:financial:defamation': new FinancialDefamationPluginGrader(),
  'dodoguard:redteam:financial:hallucination': new FinancialHallucinationPluginGrader(),
  'dodoguard:redteam:financial:impartiality': new FinancialImpartialityPluginGrader(),
  'dodoguard:redteam:financial:misconduct': new FinancialMisconductPluginGrader(),
  'dodoguard:redteam:financial:sycophancy': new FinancialSycophancyPluginGrader(),
  'dodoguard:redteam:hallucination': new HallucinationGrader(),
  'dodoguard:redteam:harmbench': new HarmbenchGrader(),
  'dodoguard:redteam:harmful': new HarmfulGrader(),
  'dodoguard:redteam:harmful:chemical-biological-weapons': new HarmfulGrader(),
  'dodoguard:redteam:harmful:child-exploitation': new ChildExploitationGrader(),
  'dodoguard:redteam:harmful:copyright-violations': new CopyrightViolationGrader(),
  'dodoguard:redteam:harmful:cybercrime': new CybercrimeGrader(),
  'dodoguard:redteam:harmful:cybercrime:malicious-code': new CybercrimeGrader(),
  'dodoguard:redteam:harmful:graphic-content': new GraphicContentGrader(),
  'dodoguard:redteam:harmful:harassment-bullying': new HarmfulGrader(),
  'dodoguard:redteam:harmful:hate': new HateGrader(),
  'dodoguard:redteam:harmful:illegal-activities': new IllegalActivitiesGrader(),
  'dodoguard:redteam:harmful:illegal-drugs': new IllegalDrugsGrader(),
  'dodoguard:redteam:harmful:illegal-drugs:meth': new IllegalDrugsGrader(),
  'dodoguard:redteam:harmful:indiscriminate-weapons': new IndiscriminateWeaponsGrader(),
  'dodoguard:redteam:harmful:insults': new InsultsGrader(),
  'dodoguard:redteam:harmful:intellectual-property': new CopyrightViolationGrader(),
  'dodoguard:redteam:harmful:misinformation-disinformation':
    new MisinformationDisinformationGrader(),
  'dodoguard:redteam:harmful:non-violent-crime': new NonViolentCrimeGrader(),
  'dodoguard:redteam:harmful:privacy': new HarmfulPrivacyGrader(),
  'dodoguard:redteam:harmful:profanity': new ProfanityGrader(),
  'dodoguard:redteam:harmful:radicalization': new RadicalizationGrader(),
  'dodoguard:redteam:harmful:self-harm': new SelfHarmGrader(),
  'dodoguard:redteam:harmful:sex-crime': new SexCrimeGrader(),
  'dodoguard:redteam:harmful:sexual-content': new SexualContentGrader(),
  'dodoguard:redteam:harmful:specialized-advice': new SpecializedAdviceGrader(),
  'dodoguard:redteam:harmful:unsafe-practices': new UnsafePracticesGrader(),
  'dodoguard:redteam:harmful:violent-crime': new ViolentCrimeGrader(),
  'dodoguard:redteam:harmful:weapons:ied': new HarmfulGrader(),
  'dodoguard:redteam:hijacking': new HijackingGrader(),
  'dodoguard:redteam:imitation': new ImitationGrader(),
  'dodoguard:redteam:indirect-prompt-injection': new IndirectPromptInjectionGrader(),
  'dodoguard:redteam:intent': new IntentGrader(),
  'dodoguard:redteam:mcp': new MCPPluginGrader(),
  'dodoguard:redteam:medical:anchoring-bias': new MedicalAnchoringBiasPluginGrader(),
  'dodoguard:redteam:medical:hallucination': new MedicalHallucinationPluginGrader(),
  'dodoguard:redteam:medical:incorrect-knowledge': new MedicalIncorrectKnowledgePluginGrader(),
  'dodoguard:redteam:medical:off-label-use': new MedicalOffLabelUsePluginGrader(),
  'dodoguard:redteam:medical:prioritization-error': new MedicalPrioritizationErrorPluginGrader(),
  'dodoguard:redteam:medical:sycophancy': new MedicalSycophancyPluginGrader(),
  'dodoguard:redteam:off-topic': new OffTopicPluginGrader(),
  'dodoguard:redteam:overreliance': new OverrelianceGrader(),
  'dodoguard:redteam:pii': new PiiGrader(),
  'dodoguard:redteam:pii:api-db': new PiiGrader(),
  'dodoguard:redteam:pii:direct': new PiiGrader(),
  'dodoguard:redteam:pii:session': new PiiGrader(),
  'dodoguard:redteam:pii:social': new PiiGrader(),
  'dodoguard:redteam:pliny': new PlinyGrader(),
  'dodoguard:redteam:policy': new PolicyViolationGrader(),
  'dodoguard:redteam:politics': new PoliticsGrader(),
  'dodoguard:redteam:prompt-extraction': new PromptExtractionGrader(),
  'dodoguard:redteam:rag-document-exfiltration': new RagDocumentExfiltrationGrader(),
  'dodoguard:redteam:rbac': new RbacGrader(),
  'dodoguard:redteam:reasoning-dos': new ReasoningDosGrader(),
  'dodoguard:redteam:religion': new ReligionGrader(),
  'dodoguard:redteam:shell-injection': new ShellInjectionGrader(),
  'dodoguard:redteam:sql-injection': new SqlInjectionGrader(),
  'dodoguard:redteam:ssrf': new SsrfGrader(),
  'dodoguard:redteam:tool-discovery': new ToolDiscoveryGrader(),
  'dodoguard:redteam:toxic-chat': new ToxicChatGrader(),
  'dodoguard:redteam:unsafebench': new UnsafeBenchGrader(),
  'dodoguard:redteam:unverifiable-claims': new UnverifiableClaimsGrader(),
  'dodoguard:redteam:vlguard': new VLGuardGrader(),
  'dodoguard:redteam:wordplay': new WordplayGrader(),
};

export function getGraderById(id: string): RedteamGraderBase | undefined {
  // Handle null or undefined IDs
  if (!id) {
    return undefined;
  }

  // First try to get the exact grader
  const grader = id in GRADERS ? GRADERS[id as keyof typeof GRADERS] : undefined;

  // If not found but the ID starts with 'dodoguard:redteam:harmful', use the general harmful grader
  if (!grader && id.startsWith('dodoguard:redteam:harmful')) {
    return GRADERS['dodoguard:redteam:harmful'];
  }

  return grader;
}
