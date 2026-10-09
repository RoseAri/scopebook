import { useRoute, match } from './lib/router.jsx';
import { I18nProvider } from './i18n/index.jsx';
import { useStore } from './store/store.js';
import { Toaster } from './components/ui.jsx';
import ClientApp from './client/ClientApp.jsx';
import DesignerShell from './designer/Shell.jsx';

export default function App() {
  const route = useRoute();
  const symbol = useStore((s) => s.settings.pricing.currencySymbol);
  const quote = match('/quote/:token', route.path);

  // The client view never renders designer navigation or settings.
  if (quote) {
    return (
      <I18nProvider currencySymbol={symbol}>
        <ClientApp token={quote.token} query={route.query} />
        <Toaster />
      </I18nProvider>
    );
  }
  return (
    <I18nProvider currencySymbol={symbol}>
      <DesignerShell route={route} />
      <Toaster />
    </I18nProvider>
  );
}
