// Auth Pages HTML Templates

const baseStyles = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'JetBrains Mono', 'Courier New', monospace; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.container { width: 100%; max-width: 400px; padding: 2rem; }
.card { background: #111; border: 1px solid #222; border-radius: 8px; padding: 2rem; }
.logo { font-size: 1.5rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem; }
.subtitle { color: #666; font-size: 0.875rem; margin-bottom: 2rem; }
.field { margin-bottom: 1.5rem; }
.label { display: block; font-size: 0.75rem; color: #888; margin-bottom: 0.5rem; }
.input { width: 100%; padding: 0.75rem 1rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px; color: #fff; font-family: inherit; font-size: 0.875rem; }
.input:focus { outline: none; border-color: #4a9eff; }
.btn { width: 100%; padding: 0.75rem; background: #4a9eff; border: none; border-radius: 4px; color: #fff; font-family: inherit; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: background 0.2s; }
.btn:hover { background: #3a8eef; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: #ff4a4a; font-size: 0.75rem; margin-bottom: 1rem; padding: 0.5rem; background: rgba(255, 74, 74, 0.1); border-radius: 4px; }
.success { color: #4aff4a; font-size: 0.875rem; text-align: center; padding: 1rem; background: rgba(74, 255, 74, 0.1); border-radius: 4px; margin-bottom: 1rem; }
.link { display: block; text-align: center; margin-top: 1.5rem; color: #666; text-decoration: none; font-size: 0.75rem; }
.link:hover { color: #4a9eff; }
.hidden { display: none; }
`;

const API_URL = process.env.API_URL || 'https://api.t-bash.space';

export function getForgotPasswordPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Password - CloseChat</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">closechat</div>
      <div class="subtitle">// reset password</div>
      <form id="requestForm">
        <div class="field">
          <label class="label" for="email">> email</label>
          <input type="email" id="email" class="input" placeholder="enter your email..." required />
        </div>
        <div id="requestError" class="error hidden"></div>
        <button type="submit" class="btn" id="requestBtn">send reset link</button>
      </form>
      <div id="requestSuccess" class="success hidden">If an account with that email exists, a reset link has been sent.</div>
    </div>
  </div>
  <script>
    const API_URL = '${API_URL}';
    const form = document.getElementById('requestForm');
    const emailInput = document.getElementById('email');
    const requestBtn = document.getElementById('requestBtn');
    const requestError = document.getElementById('requestError');
    const requestSuccess = document.getElementById('requestSuccess');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      requestError.classList.add('hidden');
      requestBtn.disabled = true;
      requestBtn.textContent = 'sending...';
      try {
        const res = await fetch(API_URL + '/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailInput.value })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to request reset');
        form.classList.add('hidden');
        requestSuccess.classList.remove('hidden');
      } catch (err) {
        requestError.textContent = err.message;
        requestError.classList.remove('hidden');
      } finally {
        requestBtn.disabled = false;
        requestBtn.textContent = 'send reset link';
      }
    });
  </script>
</body>
</html>`;
}

export function getResetPasswordPage(token: string | null) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Password - CloseChat</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">closechat</div>
      <div class="subtitle">// new password</div>
      <form id="resetForm">
        <div class="field">
          <label class="label" for="password">> new password</label>
          <input type="password" id="password" class="input" placeholder="enter new password..." required minlength="6" />
        </div>
        <div class="field">
          <label class="label" for="confirmPassword">> confirm password</label>
          <input type="password" id="confirmPassword" class="input" placeholder="confirm new password..." required minlength="6" />
        </div>
        <input type="hidden" id="token" value="${token || ''}" />
        <div id="resetError" class="error hidden"></div>
        <button type="submit" class="btn" id="resetBtn">reset password</button>
      </form>
      <div id="resetSuccess" class="success hidden">Password reset successful!</div>
    </div>
  </div>
  <script>
    const API_URL = '${API_URL}';
    const form = document.getElementById('resetForm');
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirmPassword');
    const tokenInput = document.getElementById('token');
    const resetBtn = document.getElementById('resetBtn');
    const resetError = document.getElementById('resetError');
    const resetSuccess = document.getElementById('resetSuccess');

    if (!tokenInput.value) {
      resetError.textContent = 'Invalid reset link. No token provided.';
      resetError.classList.remove('hidden');
      resetBtn.disabled = true;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (passwordInput.value !== confirmInput.value) {
        resetError.textContent = 'Passwords do not match';
        resetError.classList.remove('hidden');
        return;
      }
      if (passwordInput.value.length < 6) {
        resetError.textContent = 'Password must be at least 6 characters';
        resetError.classList.remove('hidden');
        return;
      }
      resetError.classList.add('hidden');
      resetBtn.disabled = true;
      resetBtn.textContent = 'resetting...';
      try {
        const res = await fetch(API_URL + '/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenInput.value, password: passwordInput.value })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to reset password');
        form.classList.add('hidden');
        resetSuccess.classList.remove('hidden');
      } catch (err) {
        resetError.textContent = err.message;
        resetError.classList.remove('hidden');
      } finally {
        resetBtn.disabled = false;
        resetBtn.textContent = 'reset password';
      }
    });
  </script>
</body>
</html>`;
}
