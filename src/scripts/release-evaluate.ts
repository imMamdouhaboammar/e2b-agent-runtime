import { ReleaseReadinessEvaluator } from '../security/releaseReadinessEvaluator.js';

async function main() {
  console.log('=== Running Release Readiness Evaluation ===');

  const evaluator = new ReleaseReadinessEvaluator();
  const result = await evaluator.evaluate();

  console.log(`Release State: ${result.releaseState}`);
  console.log(`Version Candidate: ${result.versionCandidate}`);
  console.log(`Evaluated Commit: ${result.evaluatedCommitSha}`);
  console.log(`Evaluated Deployment: ${result.evaluatedDeployment}`);

  console.log(`Passed Gates: ${result.passedGates.length}/${result.gates.length}`);
  for (const gate of result.gates) {
    console.log(` - [${gate.passed ? 'PASS' : 'FAIL'}] ${gate.name} (${gate.id})`);
    if (gate.notes) {
      console.log(`   Notes: ${gate.notes}`);
    }
  }

  if (result.warnings.length > 0) {
    console.warn('\nWarnings:');
    result.warnings.forEach((w) => console.warn(` - [WARN] ${w}`));
  }

  console.log('\nRequired Next Actions:');
  result.requiredNextActions.forEach((a) => console.log(` - ${a}`));

  if (result.releaseState === 'BLOCKED') {
    console.error('\nEvaluation Status: BLOCKED. Release candidate cannot proceed.');
    process.exit(1);
  } else {
    console.log('\nEvaluation Status: MVP READY. Candidate is cleared for PR review.');
    process.exit(0);
  }
}

main();
