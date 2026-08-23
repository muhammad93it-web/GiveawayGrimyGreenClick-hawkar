import { type ReactNode } from 'react';
import React from 'react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from '@/pages/dashboard';
import LiveView from '@/pages/live';
import PrivacyPolicy from '@/pages/privacy';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

class ErrorBoundary extends React.Component<{children: ReactNode, resetKey: any}, {hasError: boolean}> {
  state = { hasError: false };
  
  static getDerivedStateFromError() { 
    return { hasError: true }; 
  }
  
  componentDidUpdate(prevProps: any) {
    if (this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false });
    }
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background text-foreground p-4">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold text-destructive">هەڵەیەک ڕوویدا</h2>
            <p className="text-muted-foreground">کێشەیەک ڕوویدا لە کاتی پیشاندانی ئەم پەڕەیە.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium"
            >
              نوێکردنەوەی پەڕە
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/live" component={LiveView} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route component={() => (
          <div dir="rtl" className="flex h-screen items-center justify-center font-bold text-2xl text-muted-foreground">
            ٤٠٤ - پەڕەکە نەدۆزرایەوە
          </div>
        )} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;