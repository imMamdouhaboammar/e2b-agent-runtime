import { NodeSDK } from '@opentelemetry/sdk-node';
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { trace, type Tracer, context, type Span } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;
let tracer: Tracer | null = null;

export function initializeTelemetry() {
  if (process.env.TELEMETRY_DISABLED === 'true' || process.env.NODE_ENV === 'test') {
    return;
  }

  sdk = new NodeSDK({
    spanProcessor: new SimpleSpanProcessor(new ConsoleSpanExporter()),
  });

  sdk.start();
  tracer = trace.getTracer('e2b-agent-runtime-controller');
  console.log('OpenTelemetry initialized.');
}

export function getTracer(): Tracer {
  if (!tracer) {
    tracer = trace.getTracer('e2b-agent-runtime-controller-fallback');
  }
  return tracer;
}

export async function withSpan<T>(name: string, callback: (span: Span) => Promise<T>): Promise<T> {
  const t = getTracer();
  return t.startActiveSpan(name, async (span) => {
    try {
      const result = await callback(span);
      span.setStatus({ code: 0 }); // Ok
      return result;
    } catch (err: any) {
      span.setStatus({ code: 1, message: err.message }); // Error
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}
