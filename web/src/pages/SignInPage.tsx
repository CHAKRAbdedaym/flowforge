import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { errorMessage } from '../lib/api';
import { useLogin } from '../lib/auth';
import { useTitle } from '../lib/useTitle';
import { AuthLayout } from './AuthLayout';

/** Only allow redirects to paths inside this app (no open redirects). */
export function safeRedirect(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/home';
}

export function SignInPage() {
  useTitle('Sign in');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: () => navigate(safeRedirect(params.get('redirect')), { replace: true }) },
    );
  };

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back to FlowForge.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {login.isError && <Alert>{errorMessage(login.error)}</Alert>}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" size="lg" loading={login.isPending} className="mt-2">
          Sign in
        </Button>
        <p className="text-center text-[12px] text-subtle">
          Forgot your password? Run <code className="font-mono text-muted">npm run user:reset</code> on the server.
        </p>
      </form>
    </AuthLayout>
  );
}
