import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createClient } from '@supabase/supabase-js';
import type { ControllerConfig } from '../config.js';
import { createControllerMcpServer } from '../mcp/create-server.js';
import type { E2BWorkerManager } from '../runtime/e2b-worker-manager.js';
import type { SessionRegistry } from '../runtime/session-registry.js';
import { logger } from '../shared/logger.js';
import { createAuthMiddleware } from './auth.js';
import { checkDbConnection, query } from '../persistence/postgres/client.js';
import * as ui from './ui.js';

let isDraining = false;
let isStarted = false;

export function setDraining(val: boolean) {
  isDraining = val;
}

export function setStarted(val: boolean) {
  isStarted = val;
}

export function createControllerApp(
  config: ControllerConfig,
  workerManager: E2BWorkerManager,
  registry: SessionRegistry
): Express {
  const app = express();
  app.set('trust proxy', true);

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const supabaseUrl = process.env.SUPABASE_URL || 'https://lqekyrkxnxqtclhkaknm.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || '';

  const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  // Host Header validation middleware
  app.use((req: Request, res: Response, next) => {
    const host = req.headers.host;
    if (host && (host.includes('<script>') || host.includes('\n') || host.includes('\r'))) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Malformed Host header.' });
      return;
    }
    next();
  });

  // --- OAuth 2.1 Resource Discovery Endpoints (RFC 9728) ---
  const metadataHandler = (req: Request, res: Response) => {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    res.status(200).json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [
        baseUrl
      ],
      scopes_supported: ['openid', 'email', 'profile'],
      bearer_methods_supported: ['header'],
    });
  };
  app.get('/.well-known/oauth-protected-resource', metadataHandler);
  app.get('/.well-known/oauth-protected-resource/mcp', metadataHandler);

  // --- OpenID Connect / OAuth 2.1 Server Metadata (RFC 8414) ---
  const openidConfigHandler = (req: Request, res: Response) => {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    res.status(200).json({
      issuer: baseUrl,
      authorization_endpoint: `${supabaseUrl}/oauth/authorize`,
      token_endpoint: `${supabaseUrl}/oauth/token`,
      jwks_uri: `${supabaseUrl}/.well-known/jwks.json`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      scopes_supported: ['openid', 'email', 'profile'],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256']
    });
  };
  app.get('/.well-known/openid-configuration', openidConfigHandler);
  app.get('/.well-known/oauth-authorization-server', openidConfigHandler);

  // --- Dynamic Client Registration Endpoint (RFC 7591) ---
  app.post('/oauth/register', async (req: Request, res: Response) => {
    try {
      const {
        client_name,
        redirect_uris,
        grant_types,
        token_endpoint_auth_method,
      } = req.body;

      if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        res.status(400).json({
          error: 'invalid_client_metadata',
          error_description: 'redirect_uris must be a non-empty array.',
        });
        return;
      }

      const clientId = globalThis.crypto.randomUUID();
      const redirectUrisStr = redirect_uris.join(',');
      const grantTypesStr = grant_types && Array.isArray(grant_types) 
        ? grant_types.join(',') 
        : 'authorization_code,refresh_token';
      const authMethod = token_endpoint_auth_method || 'none';
      const clientType = authMethod === 'none' ? 'public' : 'confidential';

      const dbUrl = process.env.DATABASE_URL;
      
      await query(
        `INSERT INTO auth.oauth_clients (
          id,
          registration_type,
          redirect_uris,
          grant_types,
          client_name,
          client_type,
          token_endpoint_auth_method
        ) VALUES ($1, 'dynamic', $2, $3, $4, $5::auth.oauth_client_type, $6)`,
        [
          clientId,
          redirectUrisStr,
          grantTypesStr,
          client_name || 'AI Client',
          clientType,
          authMethod
        ],
        dbUrl
      );

      logger.info('Dynamically registered new OAuth client', {
        clientId,
        clientName: client_name || 'AI Client',
        redirectUris: redirectUrisStr,
      });

      res.status(201).json({
        client_id: clientId,
        client_name: client_name || 'AI Client',
        redirect_uris,
        grant_types: grantTypesStr.split(','),
        response_types: ['code'],
        token_endpoint_auth_method: authMethod,
        client_id_issued_at: Math.floor(Date.now() / 1000),
      });
    } catch (err: any) {
      logger.error('Failed to dynamically register OAuth client', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({
        error: 'server_error',
        error_description: 'An internal server error occurred during client registration.',
      });
    }
  });

  // --- Session Sync Helper API ---
  app.post('/api/auth/session', (req: Request, res: Response) => {
    const { access_token, refresh_token } = req.body;
    if (!access_token) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'access_token is required.' });
      return;
    }

    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';

    res.cookie('sb-access-token', access_token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: isSecure,
      maxAge: 3600 * 1000, // 1 hour
    });

    if (refresh_token) {
      res.cookie('sb-refresh-token', refresh_token, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: isSecure,
        maxAge: 30 * 24 * 3600 * 1000, // 30 days
      });
    }

    res.status(200).json({ success: true });
  });

  // --- UI Views Routing ---
  app.get('/login', (req: Request, res: Response) => {
    const authorization_id = (req.query.authorization_id as string) || '';
    const html = ui.renderLoginPage(supabaseUrl, supabaseAnonKey, authorization_id);
    res.status(200).send(html);
  });

  app.get('/auth/callback', (req: Request, res: Response) => {
    const html = ui.renderAuthCallbackPage();
    res.status(200).send(html);
  });

  // Local helper to parse cookies securely
  function parseCookies(req: Request): Record<string, string> {
    const list: Record<string, string> = {};
    const rc = req.headers.cookie;
    if (rc) {
      rc.split(';').forEach((cookie) => {
        const parts = cookie.split('=');
        list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('='));
      });
    }
    return list;
  }

  // Local helper to resolve authenticated user from cookies
  async function getAuthenticatedUser(req: Request) {
    const cookies = parseCookies(req);
    const token = cookies['sb-access-token'];
    if (!token) return null;

    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) return null;
      return user;
    } catch {
      return null;
    }
  }

  app.get('/oauth/consent', async (req: Request, res: Response) => {
    const authId = (req.query.authorization_id as string) || '';
    if (!authId) {
      res.status(400).send(ui.renderBaseHtml('Error', '<div class="card"><h1>Error</h1><p class="subtitle">Missing authorization_id parameter.</p></div>'));
      return;
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.redirect(`/login?authorization_id=${encodeURIComponent(authId)}`);
      return;
    }

    try {
      const { data, error } = await supabaseAdmin.auth.oauth.getAuthorizationDetails(authId);
      if (error || !data) {
        logger.error('Failed to get authorization details from Supabase', { error: error.message });
        res.status(400).send(ui.renderBaseHtml('Error', '<div class="card"><h1>Error</h1><p class="subtitle">Failed to load authorization context or invalid authorization ID.</p></div>'));
        return;
      }

      if ('redirect_url' in data && data.redirect_url) {
        res.redirect(data.redirect_url);
        return;
      }

      const details = data as any;
      const clientName = details.client?.name || details.client_id || 'AI Client';
      const scopes = details.scopes || ['openid', 'email', 'profile'];

      const html = ui.renderConsentPage(supabaseUrl, supabaseAnonKey, authId, clientName, scopes);
      res.status(200).send(html);
    } catch (err: any) {
      logger.error('Consent view resolution failed', { error: err.message });
      res.status(500).send(ui.renderBaseHtml('Error', '<div class="card"><h1>Error</h1><p class="subtitle">An internal error occurred loading consent.</p></div>'));
    }
  });

  app.get('/oauth/consent/approve', async (req: Request, res: Response) => {
    const authId = (req.query.authorization_id as string) || '';
    if (!authId) {
      res.status(400).send(ui.renderBaseHtml('Error', '<div class="card"><h1>Error</h1><p class="subtitle">Missing authorization_id.</p></div>'));
      return;
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.redirect(`/login?authorization_id=${encodeURIComponent(authId)}`);
      return;
    }

    try {
      const { data: detailsData } = await supabaseAdmin.auth.oauth.getAuthorizationDetails(authId);
      const details = detailsData as any;

      const { data, error } = await supabaseAdmin.auth.oauth.approveAuthorization(authId);
      if (error || !data || !data.redirect_url) {
        logger.error('Failed to approve authorization with Supabase', { error: error?.message || String(error) });
        res.status(400).send(ui.renderBaseHtml('Error', '<div class="card"><h1>Error</h1><p class="subtitle">Failed to approve connection request.</p></div>'));
        return;
      }

      if (details && details.client) {
        const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
        if (dbUrl) {
          // Ensure client policy exists
          await query(
            `INSERT INTO mcp_private.mcp_client_policies (client_id, display_name, trust_state, maximum_role)
             VALUES ($1, $2, 'allowed', 'developer')
             ON CONFLICT (client_id) DO NOTHING`,
            [details.client.id, details.client.name],
            dbUrl
          ).catch(() => {});

          // Upsert client grant
          await query(
            `INSERT INTO public.mcp_user_client_grants (user_id, client_id, status, authorized_at, revoked_at)
             VALUES ($1, $2, 'active', NOW(), NULL)
             ON CONFLICT (user_id, client_id) 
             DO UPDATE SET status = 'active', authorized_at = NOW(), revoked_at = NULL`,
            [user.id, details.client.id],
            dbUrl
          ).catch(() => {});

          // Log audit event
          await query(
            `INSERT INTO mcp_private.mcp_auth_audit_events (user_id, client_id, event_type, result)
             VALUES ($1, $2, 'oauth_approval', 'success')`,
             [user.id, details.client.id],
             dbUrl
          ).catch(() => {});
        }
      }

      res.redirect(data.redirect_url);
    } catch (err: any) {
      logger.error('Error approving consent', { error: err.message });
      res.status(500).send(ui.renderBaseHtml('Error', '<div class="card"><h1>Error</h1><p class="subtitle">An internal error occurred during approval.</p></div>'));
    }
  });

  app.get('/oauth/consent/deny', async (req: Request, res: Response) => {
    const authId = (req.query.authorization_id as string) || '';
    if (!authId) {
      res.status(400).send(ui.renderBaseHtml('Error', '<div class="card"><h1>Error</h1><p class="subtitle">Missing authorization_id.</p></div>'));
      return;
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.redirect(`/login?authorization_id=${encodeURIComponent(authId)}`);
      return;
    }

    try {
      const { data, error } = await supabaseAdmin.auth.oauth.denyAuthorization(authId);
      if (error || !data || !data.redirect_url) {
        logger.error('Failed to deny authorization with Supabase', { error: error?.message || String(error) });
        res.status(400).send(ui.renderBaseHtml('Error', '<div class="card"><h1>Error</h1><p class="subtitle">Failed to process denial redirect.</p></div>'));
        return;
      }

      res.redirect(data.redirect_url);
    } catch (err: any) {
      logger.error('Error denying consent', { error: err.message });
      res.status(500).send(ui.renderBaseHtml('Error', '<div class="card"><h1>Error</h1><p class="subtitle">An internal error occurred during denial.</p></div>'));
    }
  });

  app.get('/account', async (req: Request, res: Response) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.redirect('/login');
      return;
    }

    const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
    let role = 'viewer';
    let status = 'invited';
    let connections: any[] = [];
    let displayName = user.user_metadata?.full_name || '';

    if (dbUrl) {
      try {
        const memRes = await query(
          `SELECT role, status FROM public.runtime_memberships WHERE user_id = $1`,
          [user.id],
          dbUrl
        );
        if (memRes.rowCount && memRes.rowCount > 0) {
          role = memRes.rows[0].role;
          status = memRes.rows[0].status;
        }

        const profRes = await query(
          `SELECT display_name FROM public.runtime_profiles WHERE user_id = $1`,
          [user.id],
          dbUrl
        );
        if (profRes.rowCount && profRes.rowCount > 0) {
          displayName = profRes.rows[0].display_name;
        } else if (displayName) {
          await query(
            `INSERT INTO public.runtime_profiles (user_id, display_name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [user.id, displayName],
            dbUrl
          ).catch(() => {});
        }

        const connRes = await query(
          `SELECT g.client_id, g.authorized_at, g.last_used_at, p.display_name
           FROM public.mcp_user_client_grants g
           LEFT JOIN mcp_private.mcp_client_policies p ON g.client_id = p.client_id
           WHERE g.user_id = $1 AND g.status = 'active'`,
          [user.id],
          dbUrl
        );
        connections = connRes.rows;
      } catch (err: any) {
        logger.error('Failed to load user account database info', { error: err.message });
      }
    }

    const html = ui.renderAccountPage(
      user.email || '',
      displayName,
      role,
      status,
      connections
    );
    res.status(200).send(html);
  });

  app.post('/api/oauth/connections/:clientId/revoke', async (req: Request, res: Response) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'You must be signed in to perform this action.' });
      return;
    }

    const { clientId } = req.params;
    const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;

    if (dbUrl) {
      try {
        await query(
          `UPDATE public.mcp_user_client_grants
           SET status = 'revoked', revoked_at = NOW()
           WHERE user_id = $1 AND client_id = $2`,
          [user.id, clientId],
          dbUrl
        );

        // Record audit event
        await query(
          `INSERT INTO mcp_private.mcp_auth_audit_events (user_id, client_id, event_type, result)
           VALUES ($1, $2, 'oauth_revocation', 'success')`,
          [user.id, clientId],
          dbUrl
        ).catch(() => {});

        res.status(200).json({ success: true });
      } catch (err: any) {
        logger.error('Failed to revoke client grant', { error: err.message });
        res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Database query failed.' });
      }
    } else {
      res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Database-less revoke is not supported.' });
    }
  });

  app.post('/logout', (req: Request, res: Response) => {
    res.clearCookie('sb-access-token', { path: '/' });
    res.clearCookie('sb-refresh-token', { path: '/' });
    res.redirect('/login');
  });

  // --- Health Endpoints ---
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'e2b-agent-runtime-controller',
      version: '0.0.1',
    });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'e2b-agent-runtime-controller',
      version: '0.0.1',
    });
  });

  app.get('/health/ready', async (_req: Request, res: Response) => {
    if (isDraining) {
      res.status(503).json({
        status: 'draining',
        message: 'Server is shutting down.',
      });
      return;
    }

    try {
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      if (dbUrl) {
        const dbConnected = await checkDbConnection(dbUrl);
        if (!dbConnected) {
          res.status(503).json({
            status: 'not_ready',
            message: 'Database connection failed',
          });
          return;
        }
      }

      await registry.listSessions();
      res.status(200).json({
        status: 'ready',
        service: 'e2b-agent-runtime-controller',
      });
    } catch {
      res.status(503).json({
        status: 'not_ready',
        message: 'Session registry unavailable',
      });
    }
  });

  app.get('/ready', async (req: Request, res: Response) => {
    if (isDraining) {
      res.status(503).json({ status: 'draining', message: 'Server is shutting down.' });
      return;
    }
    try {
      await registry.listSessions();
      res.status(200).json({
        status: 'ready',
        service: 'e2b-agent-runtime-controller',
      });
    } catch {
      res.status(503).json({
        status: 'not_ready',
        message: 'Session registry unavailable',
      });
    }
  });

  app.get('/health/startup', (_req: Request, res: Response) => {
    if (isStarted) {
      res.status(200).json({
        status: 'started',
        service: 'e2b-agent-runtime-controller',
      });
    } else {
      res.status(503).json({
        status: 'starting',
        message: 'Server is still initializing',
      });
    }
  });

  // Active SSE sessions Map
  const sseSessions = new Map<
    string,
    {
      transport: SSEServerTransport;
      mcpServer: any;
    }
  >();

  // Protected MCP HTTP Endpoint
  const authMiddleware = createAuthMiddleware(config.mcpAccessToken);

  app.all('/mcp', authMiddleware, (req: Request, res: Response) => {
    if (isDraining) {
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Server is draining and shutting down.',
      });
      return;
    }

    if (req.method === 'GET') {
      res.setHeader('X-Accel-Buffering', 'no');

      const transport = new SSEServerTransport('/mcp', res);
      const server = createControllerMcpServer(workerManager, registry);

      server.connect(transport).then(() => {
        sseSessions.set(transport.sessionId, { transport, mcpServer: server });
        logger.info('SSE transport connected and registered', { sessionId: transport.sessionId });
      }).catch((err) => {
        logger.error('Failed to connect MCP server to SSE transport', {
          error: err instanceof Error ? err.message : String(err),
        });
        if (!res.headersSent) {
          res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to establish SSE transport connection.' });
        }
      });

      transport.onclose = () => {
        logger.info('SSE transport connection closed', { sessionId: transport.sessionId });
        sseSessions.delete(transport.sessionId);
      };

      return;
    }

    if (req.method === 'POST') {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing sessionId query parameter.' });
        return;
      }

      const session = sseSessions.get(sessionId);
      if (!session) {
        res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'SSE session not found or expired.' });
        return;
      }

      session.transport.handlePostMessage(req, res, req.body).catch((err) => {
        logger.error('Error handling SSE POST message', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (!res.headersSent) {
          res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to process SSE message.' });
        }
      });
      return;
    }

    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed. Use GET or POST.' });
  });

  return app;
}
