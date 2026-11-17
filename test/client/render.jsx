import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '../../src/components/ui/Toast';
import { TransactionContext } from '../../src/context/transaction';

/** Empty send-flow context, same shape as TransactionProvider's initial state. */
export const EMPTY_TRANSACTION = { countryCode: null, quote: null, beneficiary: null, account: null, paymentMethod: null };

/**
 * Renders `ui` inside the providers the pages expect: a MemoryRouter at `route` (optionally with
 * `path` so useParams works, and `state` for useLocation().state), the ToastProvider and a
 * TransactionContext whose value can be controlled from the test.
 */
export function renderWithProviders(
  ui,
  { route = '/', path = '*', state, transaction = {}, setTransactionData = () => {}, resetTransaction = () => {}, extraRoutes = null } = {},
) {
  const value = { transactionData: { ...EMPTY_TRANSACTION, ...transaction }, setTransactionData, resetTransaction };
  const entry = state === undefined ? route : { pathname: route, state };
  const result = render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <TransactionContext.Provider value={value}>
          <Routes>
            <Route path={path} element={ui} />
            {extraRoutes}
          </Routes>
        </TransactionContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return { ...result, contextValue: value };
}

/** Route element that prints the current location, to assert navigations: <Route path="*" element={<LocationProbe />} />. */
export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}
