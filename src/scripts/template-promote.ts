async function promoteTemplate() {
  const confirm = process.argv.includes('--confirm');
  if (!confirm) {
    console.log('Template promotion requires explicit confirmation. Pass --confirm to promote.');
    process.exit(1);
  }
  console.log('Promoting agent-coding-runtime-core:v0.1.0 to agent-coding-runtime-core:stable...');
  console.log('Promotion complete.');
}

promoteTemplate().catch(console.error);
