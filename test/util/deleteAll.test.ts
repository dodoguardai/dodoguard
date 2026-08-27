import { runDbMigrations } from '../../backend/src/migrate';
import Eval from '../../backend/src/models/eval';
import { deleteAllEvals } from '../../backend/src/util/database';
import EvalFactory from '../factories/evalFactory';

describe('delete all evals', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });
  it('should delete all evals', async () => {
    await EvalFactory.create();
    await EvalFactory.create();
    await EvalFactory.create();

    const evals = await Eval.getMany();
    expect(evals).toHaveLength(3);

    await deleteAllEvals();

    const evals2 = await Eval.getMany();
    expect(evals2).toHaveLength(0);
  });
});
