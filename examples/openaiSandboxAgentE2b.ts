import { run } from '@openai/agents';
import { SandboxAgent, Manifest } from '@openai/agents-extensions/sandbox';
import { E2BSandboxClient } from '@openai/agents-extensions/sandbox/e2b';
import dotenv from 'dotenv';

dotenv.config();

async function start() {
  console.log('=== OpenAI Sandbox Agent Headless E2B Example ===');

  const openaiApiKey = process.env.OPENAI_API_KEY;
  const e2bApiKey = process.env.E2B_API_KEY;

  if (!openaiApiKey || !e2bApiKey) {
    console.error('Error: Please configure OPENAI_API_KEY and E2B_API_KEY in .env file.');
    process.exit(1);
  }

  const client = new E2BSandboxClient({
    apiKey: e2bApiKey,
  });

  const manifest = new Manifest({
    entries: {}, // Empty workspace definition
  });

  // SandboxAgent auto-wires filesystem and shell capabilities
  const agent = new SandboxAgent({
    name: 'HeadlessSandboxAgent',
    instructions: 'You are an experimental developer agent inside a secure Firecracker sandbox.',
  });

  console.log('Creating sandbox session and starting agent execution...');
  
  try {
    const result = await run(agent, 'Check the operating system name and list current directories', {
      sandbox: {
        client,
        manifest,
      },
    });

    console.log('\nAgent Run Output:');
    console.log(result);
  } finally {
    // Session is closed automatically or manually.
    console.log('Sandbox execution finished. Session destroyed.');
  }
}

start().catch((err) => {
  console.error('Headless example run failed:', err);
});
