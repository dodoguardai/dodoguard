import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SecurityTestCase } from '@/types/entities';
import {
  TechnicalCaseFormFields,
  type TechnicalCaseFormState,
} from './technical-case-form-fields';
import type { MappedTechnicalLibrary } from './shared';
import { normalizeTechnicalRiskLevel } from './shared';
import {
  buildCaseBasisValue,
  resolveCaseBasisPreset,
} from './technical-case-basis-presets';
import {
  buildTechnicalCaseMetadata,
  normalizeTurnSteps,
  readTechnicalCaseMetadata,
  resolveCustomTestMethodLabel,
  resolveTestMethodSlug,
  TECHNICAL_TEST_METHODS,
} from './technical-case-test-methods';

export function emptyTechnicalCaseForm(library: MappedTechnicalLibrary): TechnicalCaseFormState {
  const basis = resolveCaseBasisPreset(library.standards[0]);
  return {
    caseCode: '',
    name: '',
    testMethodSlug: 'direct',
    customTestMethod: '',
    prompt: '',
    expectedPass: '',
    expectedFail: '',
    riskLevel: library.level,
    attackScene: library.domain,
    riskSubclass: library.category || library.title,
    caseBasisPreset: basis.preset,
    customCaseBasis: basis.custom,
    turnSteps: [],
  };
}

export function technicalCaseFormFromEntity(
  item: SecurityTestCase,
  library: MappedTechnicalLibrary,
): TechnicalCaseFormState {
  const meta = readTechnicalCaseMetadata(item.metadata);
  const slug = resolveTestMethodSlug(item.attackType, item.metadata);
  const turnSteps = normalizeTurnSteps(item.metadata, item.prompt);
  const customTestMethod =
    slug === 'custom' ? resolveCustomTestMethodLabel(item.attackType, item.metadata) : '';
  const caseBasis = resolveCaseBasisPreset(meta.caseBasis, library.standards[0]);
  return {
    caseCode: item.caseCode,
    name: item.name,
    testMethodSlug: slug,
    customTestMethod,
    prompt: item.prompt,
    expectedPass: item.expectedPass || '',
    expectedFail: item.expectedFail || '',
    riskLevel: normalizeTechnicalRiskLevel(item.riskLevel),
    attackScene: meta.attackScene || library.domain,
    riskSubclass: meta.riskSubclass || library.category || library.title,
    caseBasisPreset: caseBasis.preset,
    customCaseBasis: caseBasis.custom,
    turnSteps:
      slug === 'multi_turn'
        ? turnSteps.length
          ? turnSteps
          : [{ userInput: '', expectedSafe: '' }]
        : [],
  };
}

export function buildTechnicalCasePayload(
  form: TechnicalCaseFormState,
  options?: { status?: 'draft' | 'reviewing' | 'published' },
) {
  const method = TECHNICAL_TEST_METHODS.find((item) => item.slug === form.testMethodSlug);
  if (!method) {
    throw new Error('请选择测试方式');
  }
  if (form.testMethodSlug === 'custom' && !form.customTestMethod.trim()) {
    throw new Error('请填写自定义测试方式');
  }
  const caseBasis = buildCaseBasisValue(form.caseBasisPreset, form.customCaseBasis);
  if (!caseBasis) {
    throw new Error('请选择或填写用例依据');
  }

  const metadata = buildTechnicalCaseMetadata({
    testMethodSlug: form.testMethodSlug,
    customTestMethod: form.customTestMethod,
    attackScene: form.attackScene.trim(),
    riskSubclass: form.riskSubclass.trim(),
    caseBasis,
    turnSteps: form.testMethodSlug === 'multi_turn' ? form.turnSteps : undefined,
  });

  let prompt = form.prompt.trim();
  if (form.testMethodSlug === 'multi_turn') {
    const steps = form.turnSteps.filter((step) => step.userInput.trim());
    if (!steps.length) {
      throw new Error('请至少填写一轮用户输入');
    }
    prompt = steps.map((step) => step.userInput.trim()).join('\n---\n');
  } else if (!prompt) {
    throw new Error('请填写测试 Prompt');
  }

  return {
    name: form.name.trim() || undefined,
    attackType: form.testMethodSlug,
    prompt,
    expectedPass: form.expectedPass.trim() || undefined,
    expectedFail: form.expectedFail.trim() || undefined,
    riskLevel: form.riskLevel,
    status: options?.status ?? 'published',
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
}

type TechnicalCaseSampleFormDialogProps = {
  open: boolean;
  library: MappedTechnicalLibrary;
  editingCase: SecurityTestCase | null;
  form: TechnicalCaseFormState;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: TechnicalCaseFormState) => void;
  onSubmit: () => void;
};

export function TechnicalCaseSampleFormDialog({
  open,
  library,
  editingCase,
  form,
  pending,
  onOpenChange,
  onFormChange,
  onSubmit,
}: TechnicalCaseSampleFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[820px]">
        <DialogHeader className="space-y-1 border-b px-6 py-5">
          <DialogTitle className="text-lg">
            {editingCase ? '编辑检测用例' : '新建检测用例'}
          </DialogTitle>
          <DialogDescription>
            {library.title} · 配置归属、测试输入与预期判定
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              buildTechnicalCasePayload(form, {
                status:
                  editingCase?.status === 'archived'
                    ? 'draft'
                    : editingCase?.status || 'published',
              });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : '表单校验失败');
              return;
            }
            onSubmit();
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <TechnicalCaseFormFields library={library} form={form} onChange={onFormChange} />
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '保存中' : '保存用例'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
