import { ReleaseReadinessEvaluator } from '../security/releaseReadinessEvaluator.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

async function main() {
  console.log('Generating markdown release readiness report ...');

  const evaluator = new ReleaseReadinessEvaluator();
  const result = await evaluator.evaluate();

  let md = `# Release Readiness Report\n\n`;
  md += `**Generated At**: ${new Date().toISOString()}\n`;
  md += `**Release State**: \`${result.releaseState}\`\n`;
  md += `**Version Candidate**: \`${result.versionCandidate}\`\n`;
  md += `**Evaluated Commit SHA**: \`${result.evaluatedCommitSha}\`\n\n`;

  md += `## Gates Summary\n\n`;
  md += `| Gate ID | Name | Category | Passed | Notes |\n`;
  md += `|---|---|---|---|---|\n`;

  for (const gate of result.gates) {
    md += `| \`${gate.id}\` | ${gate.name} | ${gate.category} | ${gate.passed ? '✅ PASS' : '❌ FAIL'} | ${gate.notes || ''} |\n`;
  }

  md += `\n## Known Risks\n\n`;
  for (const risk of result.knownRisks) {
    md += `- ${risk}\n`;
  }

  md += `\n## Required Next Actions\n\n`;
  for (const action of result.requiredNextActions) {
    md += `- ${action}\n`;
  }

  const reportPath = path.join(projectRoot, 'release/release-readiness-report.md');
  const releaseDir = path.dirname(reportPath);
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, md, 'utf8');
  console.log(`Successfully generated markdown release report at: ${reportPath}`);
}

main();
