import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Check, X } from 'lucide-react';
import { PASSWORD_RULES, isValidEmail, passwordProblems } from '@flowforge/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { cn } from '../components/ui/cn';
import { Field } from '../components/ui/Field';
import { errorMessage } from '../lib/api';
import { useSetupOwner } from '../lib/auth';
import { useTitle } from '../lib/useTitle';
import { AuthLayout } from './AuthLayout';

type Errors = Partial<Record<'email' | 'firstName', string>>;

export function SetupPage() {
  useTitle('Set up owner account');
  const navigate = useNavigate();
  const setup = useSetupOwner();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', password: '' });
  const [submitted, setSubmitted] = useState(false);

  const update = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Errors are derived from the current values, so they disappear as soon as the user fixes them.
  const errors: Errors = {};
  if (!isValidEmail(form.email)) errors.email = 'Enter a valid email address';
  if (!form.firstName.trim()) errors.firstName = 'First name is required';
  const passwordOk = passwordProblems(form.password).length === 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length || !passwordOk) return;
    setup.mutate(form, { onSuccess: () => navigate('/home', { replace: true }) });
  };

  return (
    <AuthLayout title="Set up owner account" subtitle="This account manages your FlowForge instance.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {setup.isError && <Alert>{errorMessage(setup.error)}</Alert>}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu"
          value={form.email}
          onChange={update('email')}
          error={submitted ? errors.email : undefined}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="First name"
            autoComplete="given-name"
            value={form.firstName}
            onChange={update('firstName')}
            error={submitted ? errors.firstName : undefined}
          />
          <Field label="Last name" autoComplete="family-name" value={form.lastName} onChange={update('lastName')} />
        </div>
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update('password')}
          aria-invalid={submitted && !passwordOk ? true : undefined}
          hint={
            <ul className="mt-1 flex flex-col gap-1" aria-label="Password rules">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(form.password);
                return (
                  <li
                    key={rule.id}
                    className={cn('flex items-center gap-1.5', ok ? 'text-success' : submitted ? 'text-danger' : 'text-subtle')}
                  >
                    {ok ? <Check size={13} /> : <X size={13} />} {rule.label}
                  </li>
                );
              })}
            </ul>
          }
        />
        <Button type="submit" size="lg" loading={setup.isPending} className="mt-2">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
