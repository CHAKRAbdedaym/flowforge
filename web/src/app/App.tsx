import { lazy, Suspense } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import type { AuthStatus } from '@flowforge/shared';
import { FullScreenLoader } from '../components/FullScreen';
import { Toaster } from '../components/Toaster';
import { AppLayout } from '../layout/AppLayout';
import { MAIN_NAV, SETTINGS_NAV } from '../layout/nav';
import { ApiError } from '../lib/api';
import { AUTH_STATUS_KEY } from '../lib/auth';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { SetupPage } from '../pages/SetupPage';
import { SignInPage } from '../pages/SignInPage';
import { WorkflowsPage } from '../pages/WorkflowsPage';
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

// The editor (canvas, CodeMirror, all node icons) is loaded only when a workflow is opened.
const EditorPage = lazy(() => import('../editor/EditorPage').then((m) => ({ default: m.EditorPage })));

const placeholderPages = [...MAIN_NAV.filter((item) => item.phase), SETTINGS_NAV];

// A data router is needed for useBlocker (unsaved-changes warning in the editor).
const router = createBrowserRouter([
  {
    path: '/setup',
    element: (
      <PublicOnly page="setup">
        <SetupPage />
      </PublicOnly>
    ),
  },
  {
    path: '/signin',
    element: (
      <PublicOnly page="signin">
        <SignInPage />
      </PublicOnly>
    ),
  },
  {
    path: '/workflow/:id',
    element: (
      <RequireAuth>
        {() => (
          <Suspense fallback={<FullScreenLoader />}>
            <EditorPage />
          </Suspense>
        )}
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: <RequireAuth>{(user) => <AppLayout user={user} />}</RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: 'home', element: <RequireAuth>{(user) => <OverviewPage user={user} />}</RequireAuth> },
      { path: 'workflows', element: <WorkflowsPage /> },
      ...placeholderPages.map((item) => ({ path: item.to.slice(1), element: <PlaceholderPage item={item} /> })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

function Root() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  );
}

