import { parseDifyYamlToStructure } from '../../backend/src/services/difyConfigStructure';

describe('difyConfigNodeExtractors - LLM details', () => {
  it('extracts flat model/provider/mode and completion_params values', () => {
    const yaml = `kind: app
version: "0.1"
app:
  name: FlatLlm
  mode: workflow
workflow:
  conversation_variables: []
  environment_variables: []
  features: {}
  graph:
    nodes:
      - id: llm-flat
        type: custom
        data:
          type: llm
          title: Flat LLM
          model: openai/gpt-4o-mini
          mode: chat
          provider: openai
          completion_params:
            temperature: 0.7
            top_p: 0.9
    edges: []
`;
    const { inventory } = parseDifyYamlToStructure(yaml);
    const n = inventory.nodes.find((x) => x.id === 'llm-flat');
    expect(n?.details).toBeDefined();
    const d = n?.details as any;
    expect(d.kind).toBe('llm');
    expect(d.model).toBe('openai/gpt-4o-mini');
    expect(d.mode).toBe('chat');
    expect(d.provider).toBe('openai');
    expect(d.completion_param_keys).toEqual(expect.arrayContaining(['temperature', 'top_p']));
    expect(d.completion_params).toMatchObject({ temperature: 0.7, top_p: 0.9 });
  });

  it('extracts nested model.name/provider/mode for LLM', () => {
    const yaml = `kind: app
version: "0.1"
app:
  name: NestedLlm
  mode: workflow
workflow:
  conversation_variables: []
  environment_variables: []
  features: {}
  graph:
    nodes:
      - id: llm-nested
        type: custom
        data:
          type: llm
          title: Nested LLM
          model:
            name: deepseek-ai/DeepSeek-V3.1
            provider: langgenius/siliconflow/siliconflow
            mode: chat
          completion_params:
            temperature: 0.3
    edges: []
`;
    const { inventory } = parseDifyYamlToStructure(yaml);
    const n = inventory.nodes.find((x) => x.id === 'llm-nested');
    expect(n?.details).toBeDefined();
    const d = n?.details as any;
    expect(d.kind).toBe('llm');
    expect(d.model).toBe('deepseek-ai/DeepSeek-V3.1');
    expect(d.mode).toBe('chat');
    expect(d.provider).toBe('langgenius/siliconflow/siliconflow');
    expect(d.completion_param_keys).toEqual(expect.arrayContaining(['temperature']));
    expect(d.completion_params).toMatchObject({ temperature: 0.3 });
  });
});
