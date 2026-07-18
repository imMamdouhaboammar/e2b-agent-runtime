import type { Request } from 'express';

// Shared premium base HTML wrapping standard styling tokens, fonts, and layouts
export function renderBaseHtml(
  title: string,
  content: string,
  inlineScript = ''
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | E2B MCP Controller</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #020617;
      --bg-secondary: #0b1329;
      --card-bg: rgba(15, 23, 42, 0.45);
      --border-glow: rgba(255, 255, 255, 0.07);
      --border-glow-top: rgba(255, 255, 255, 0.15);
      --accent-blue: #3b82f6;
      --accent-purple: #8b5cf6;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-error: #ef4444;
      --text-success: #10b981;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: radial-gradient(circle at 50% 30%, var(--bg-secondary) 0%, var(--bg-primary) 100%);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      overflow-x: hidden;
      padding: 2rem 1rem;
    }

    /* Core Glassmorphic Card (Doppelrand styling) */
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-glow);
      border-top: 1px solid var(--border-glow-top);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
      border-radius: 24px;
      padding: 3rem 2.5rem;
      width: 100%;
      max-width: 480px;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .card:hover {
      box-shadow: 0 25px 60px rgba(59, 130, 246, 0.1);
    }

    h1 {
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      margin-bottom: 0.75rem;
      text-align: center;
      background: linear-gradient(135deg, #ffffff 30%, #a5f3fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      font-size: 1rem;
      color: var(--text-muted);
      text-align: center;
      margin-bottom: 2.5rem;
      line-height: 1.5;
    }

    /* Input Styling */
    .form-group {
      margin-bottom: 1.5rem;
      display: flex;
      flex-direction: column;
    }

    .form-group label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-main);
      margin-bottom: 0.5rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .form-control {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 0.875rem 1rem;
      color: var(--text-main);
      font-family: inherit;
      font-size: 1rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .form-control:focus {
      outline: none;
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
    }

    /* Beautiful Gradient Button */
    .btn {
      display: inline-block;
      width: 100%;
      padding: 0.875rem 1.5rem;
      background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 4px 15px rgba(139, 92, 246, 0.25);
      text-align: center;
      text-decoration: none;
    }

    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(139, 92, 246, 0.4);
    }

    .btn:active {
      transform: translateY(0);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-main);
      box-shadow: none;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
      box-shadow: none;
    }

    /* Alerts and feedback states */
    .alert {
      padding: 1rem;
      border-radius: 12px;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
      line-height: 1.5;
      display: none;
    }

    .alert-error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #fca5a5;
    }

    .alert-success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: #a7f3d0;
    }

    .divider {
      display: flex;
      align-items: center;
      text-align: center;
      margin: 1.5rem 0;
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .divider::before, .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .divider:not(:empty)::before {
      margin-right: .5em;
    }

    .divider:not(:empty)::after {
      margin-left: .5em;
    }

    /* Custom scrollbars */
    ::-webkit-scrollbar {
      width: 8px;
    }
    ::-webkit-scrollbar-track {
      background: var(--bg-primary);
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    /* Utilities */
    .text-center { text-align: center; }
    .mt-4 { margin-top: 1rem; }
    .mt-6 { margin-top: 1.5rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .flex-row-gap { display: flex; gap: 1rem; }

    @media (max-width: 480px) {
      .card {
        padding: 2rem 1.5rem;
      }
    }
  </style>
</head>
<body>
  ${content}

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    // Injected inline logic
    ${inlineScript}
  </script>
</body>
</html>`;
}

// 1. GET /login Template
export function renderLoginPage(
  supabaseUrl: string,
  supabaseAnonKey: string,
  pendingAuthId = ''
): string {
  const content = `
    <div class="card">
      <h1>Sign In</h1>
      <p class="subtitle">Access the E2B Agent Runtime Controller</p>

      <div id="alert-error" class="alert alert-error"></div>
      <div id="alert-success" class="alert alert-success"></div>

      <form id="login-form">
        <div class="form-group">
          <label for="email">Email Address</label>
          <input type="email" id="email" class="form-control" placeholder="you@example.com" required autocomplete="username">
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <button type="submit" id="btn-login" class="btn">Sign In with Password</button>
      </form>

      <div class="divider">or</div>

      <div class="form-group">
        <button id="btn-magic-link" class="btn btn-secondary" style="width: 100%;">Send Magic Link</button>
      </div>
    </div>
  `;

  const inlineScript = `
    const supabaseUrl = '${supabaseUrl}';
    const supabaseAnonKey = '${supabaseAnonKey}';
    const pendingAuthId = '${pendingAuthId}';
    const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorAlert = document.getElementById('alert-error');
    const successAlert = document.getElementById('alert-success');
    const loginBtn = document.getElementById('btn-login');
    const magicBtn = document.getElementById('btn-magic-link');

    function showError(msg) {
      errorAlert.textContent = msg;
      errorAlert.style.display = 'block';
      successAlert.style.display = 'none';
    }

    function showSuccess(msg) {
      successAlert.textContent = msg;
      successAlert.style.display = 'block';
      errorAlert.style.display = 'none';
    }

    async function handleSessionExchange(session) {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to synchronize session cookie.');
        }

        // Redirect appropriately
        if (pendingAuthId) {
          window.location.href = '/oauth/consent?authorization_id=' + pendingAuthId;
        } else {
          window.location.href = '/account';
        }
      } catch (err) {
        showError(err.message);
      }
    }

    // Capture auth state changes in case of magic links
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        await handleSessionExchange(session);
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginBtn.disabled = true;
      loginBtn.textContent = 'Signing in...';
      errorAlert.style.display = 'none';

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailInput.value,
          password: passwordInput.value,
        });

        if (error) throw error;
        if (data.session) {
          await handleSessionExchange(data.session);
        }
      } catch (err) {
        showError(err.message || 'An error occurred during authentication.');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In with Password';
      }
    });

    magicBtn.addEventListener('click', async () => {
      if (!emailInput.value) {
        showError('Please enter your email address to request a magic link.');
        emailInput.focus();
        return;
      }

      magicBtn.disabled = true;
      magicBtn.textContent = 'Sending link...';
      errorAlert.style.display = 'none';

      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: emailInput.value,
          options: {
            emailRedirectTo: window.location.origin + '/auth/callback' + (pendingAuthId ? '?authorization_id=' + pendingAuthId : ''),
          }
        });

        if (error) throw error;
        showSuccess('Magic link sent successfully! Check your inbox.');
      } catch (err) {
        showError(err.message || 'An error occurred sending the magic link.');
      } finally {
        magicBtn.disabled = false;
        magicBtn.textContent = 'Send Magic Link';
      }
    });
  `;

  return renderBaseHtml('Sign In', content, inlineScript);
}

// 2. GET /oauth/consent Template
export function renderConsentPage(
  supabaseUrl: string,
  supabaseAnonKey: string,
  authId: string,
  clientName: string,
  scopes: string[]
): string {
  const content = `
    <div class="card" style="max-width: 540px;">
      <h1 style="font-size: 2rem;">App Connection Request</h1>
      <p class="subtitle" style="margin-bottom: 2rem;"><strong>${clientName}</strong> wants to connect to your E2B Controller</p>

      <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 1.5rem; margin-bottom: 2rem;">
        <p style="font-size: 0.875rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1rem; font-weight: 600;">Requested Permissions:</p>
        <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.875rem;">
          ${scopes
            .map(
              (scope) => `
            <li style="display: flex; align-items: flex-start; gap: 0.75rem; font-size: 0.95rem;">
              <span style="color: var(--text-success); font-weight: bold; font-size: 1.1rem; line-height: 1;">✓</span>
              <div>
                <strong style="color: var(--text-main);">${scope}</strong>
                <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.15rem;">
                  ${getScopeDescription(scope)}
                </p>
              </div>
            </li>
          `
            )
            .join('')}
        </ul>
      </div>

      <div style="font-size: 0.8125rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 2rem; text-align: center;">
        By clicking <strong>Approve</strong>, you authorize this application to connect to the MCP Controller. You can revoke this connection at any time in your Account dashboard.
      </div>

      <div class="flex-row-gap">
        <button id="btn-deny" class="btn btn-secondary" style="flex: 1;">Deny</button>
        <button id="btn-approve" class="btn" style="flex: 1.5;">Approve</button>
      </div>
    </div>
  `;

  const inlineScript = `
    const authId = '${authId}';
    
    document.getElementById('btn-approve').addEventListener('click', async () => {
      document.getElementById('btn-approve').disabled = true;
      document.getElementById('btn-approve').textContent = 'Redirecting...';
      window.location.href = '/oauth/consent/approve?authorization_id=' + authId;
    });

    document.getElementById('btn-deny').addEventListener('click', () => {
      document.getElementById('btn-deny').disabled = true;
      window.location.href = '/oauth/consent/deny?authorization_id=' + authId;
    });
  `;

  return renderBaseHtml('Authorize Connection', content, inlineScript);
}

// 3. GET /account Template
export function renderAccountPage(
  email: string,
  displayName: string,
  role: string,
  status: string,
  connections: any[]
): string {
  const connListHtml =
    connections.length === 0
      ? `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.9375rem; border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px; background: rgba(0,0,0,0.15);">
          No active application connections found.
        </div>`
      : `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${connections
            .map(
              (conn) => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255,255,255,0.06); padding: 1.25rem; border-radius: 16px;">
              <div>
                <strong style="font-size: 1rem; color: var(--text-main);">${conn.display_name || conn.client_id}</strong>
                <div style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.25rem;">
                  Authorized: ${new Date(conn.authorized_at).toLocaleDateString()}
                  ${conn.last_used_at ? ` &bull; Last used: ${new Date(conn.last_used_at).toLocaleDateString()}` : ''}
                </div>
              </div>
              <button class="btn btn-secondary revoke-btn" data-client-id="${conn.client_id}" style="padding: 0.5rem 1rem; font-size: 0.875rem; width: auto; border-color: rgba(239, 68, 68, 0.2); color: #fca5a5; background: rgba(239, 68, 68, 0.05);">
                Revoke
              </button>
            </div>
          `
            )
            .join('')}
        </div>`;

  const content = `
    <div class="card" style="max-width: 600px;">
      <h1>Account Portal</h1>
      <p class="subtitle">Manage your profile and connected applications</p>

      <div style="display: flex; gap: 1.5rem; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 20px; margin-bottom: 2.5rem;">
        <div style="width: 64px; height: 64px; border-radius: 32px; background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple)); display: flex; align-items: center; justify-content: center; font-size: 1.75rem; font-weight: bold; color: white;">
          ${displayName ? displayName.charAt(0).toUpperCase() : email.charAt(0).toUpperCase()}
        </div>
        <div style="flex: 1;">
          <h2 style="font-size: 1.25rem; font-weight: 600;">${displayName || 'Controller Member'}</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted); margin-top: 0.15rem;">${email}</p>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59,130,246,0.3); color: #93c5fd; padding: 0.15rem 0.5rem; border-radius: 9999px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">
              Role: ${role}
            </span>
            <span style="font-size: 0.75rem; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16,185,129,0.3); color: #a7f3d0; padding: 0.15rem 0.5rem; border-radius: 9999px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">
              Status: ${status}
            </span>
          </div>
        </div>
      </div>

      <div class="mb-6">
        <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.5rem;">Authorized App Connections</h3>
        ${connListHtml}
      </div>

      <div class="mt-6">
        <form action="/logout" method="POST">
          <button type="submit" class="btn btn-secondary" style="width: 100%;">Sign Out</button>
        </form>
      </div>
    </div>
  `;

  const inlineScript = `
    document.querySelectorAll('.revoke-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const clientId = btn.getAttribute('data-client-id');
        if (!confirm('Are you sure you want to revoke access for ' + clientId + '?')) {
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Revoking...';

        try {
          const res = await fetch('/api/oauth/connections/' + encodeURIComponent(clientId) + '/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });

          if (!res.ok) {
            throw new Error('Failed to revoke client grant.');
          }

          // Reload the page to reflect updates
          window.location.reload();
        } catch (err) {
          alert('Error: ' + err.message);
          btn.disabled = false;
          btn.textContent = 'Revoke';
        }
      });
    });
  `;

  return renderBaseHtml('Account Portal', content, inlineScript);
}

// 4. GET /auth/callback (Loading Page)
export function renderAuthCallbackPage(): string {
  const content = `
    <div class="card text-center" style="max-width: 400px;">
      <h1>Synchronizing Session</h1>
      <p class="subtitle" style="margin-bottom: 1.5rem;">Please wait while we establish your secure runtime environment...</p>
      <div style="margin: 2rem auto; width: 48px; height: 48px; border: 4px solid rgba(255,255,255,0.1); border-top-color: var(--accent-blue); border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <style>
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    </div>
  `;

  const inlineScript = `
    // Parse Hash Fragment containing token params
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken) {
        // Retrieve redirect context
        const urlParams = new URLSearchParams(window.location.search);
        const pendingAuthId = urlParams.get('authorization_id') || '';

        fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken })
        })
        .then(res => {
          if (!res.ok) throw new Error('Failed session sync');
          if (pendingAuthId) {
            window.location.href = '/oauth/consent?authorization_id=' + pendingAuthId;
          } else {
            window.location.href = '/account';
          }
        })
        .catch(err => {
          alert('Failed to establish session: ' + err.message);
          window.location.href = '/login';
        });
      } else {
        window.location.href = '/login';
      }
    } else {
      window.location.href = '/login';
    }
  `;

  return renderBaseHtml('Callback Sync', content, inlineScript);
}

// Helper to provide human-readable details for specific OAuth scopes
function getScopeDescription(scope: string): string {
  switch (scope) {
    case 'openid':
      return 'Enables secure identity identification using OpenID Connect.';
    case 'email':
      return 'Allows viewing your primary verified account email address.';
    case 'profile':
      return 'Allows viewing display name, avatar, and basic membership metadata.';
    case 'phone':
      return 'Allows viewing your registered mobile number.';
    default:
      return 'General access to controller resource scopes.';
  }
}
