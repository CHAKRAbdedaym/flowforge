import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import type { AuthStatus } from '@flowforge/shared';
import { AppLayout } from '../layout/AppLayout';
import { MAIN_NAV, SETTINGS_NAV } from '../layout/nav';
import { ApiError } from '../lib/api';
import { AUTH_STATUS_KEY } from '../lib/auth';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { SetupPage } from '../pages/SetupPage';
import { SignInPage } from '../pages/SignInPage';
import { PublicOnly, RequireAuth } from './guards';

/** A 401 "unauthorized" anywhere means the session expired: drop the user so the guard shows sign-in. */
function handleSessionExpired(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && error.code === 'unauthorized') {
    queryClient.setQueryData<AuthStatus>(AUTH_STATUS_KEY, (s) => (s ? { ...s, user: null } : s));
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleSessionExpired }),
  mutationCache: new MutationCache({ onError: handleSessionExpired }),
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

const placeholderPages = [...MAIN_NAV.filter((item) => item.phase), SETTINGS_NAV];

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/setup"
            element={
              <PublicOnly page="setup">
                <SetupPage />
              </PublicOnly>
            }
          />
          <Route
            path="/signin"
            element={
              <PublicOnly page="signin">
                <SignInPage />
              </PublicOnly>
            }
          />
          <Route path="/" element={<RequireAuth>{(user) => <AppLayout user={user} />}</RequireAuth>}>
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<RequireAuth>{(user) => <OverviewPage user={user} />}</RequireAuth>} />
            {placeholderPages.map((item) => (
              <Route key={item.to} path={item.to.slice(1)} element={<PlaceholderPage item={item} />} />
            ))}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
