import { NodeSDK } from '@opentelemetry/sdk-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';

export const sdk = new NodeSDK({
  spanProcessor: new SimpleSpanProcessor(new ConsoleSpanExporter()),
});

export function initializeTelemetry() {
  if (process.env.TELEMETRY_DISABLED === 'true') {
    return;
  }
  sdk.start();
  console.log('OpenTelemetry initialized.');
}
