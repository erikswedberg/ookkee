import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BooksView from '../BooksView';

vi.stubGlobal('fetch', vi.fn());

const rollforwardRows = [
  {
    year: 2024,
    equity_boy: 202.79,
    net_income: -55553.65,
    contributions: 224846.66,
    distributions: 169489.8,
    equity_eoy: 6,
    cash_eoy: 6,
    equity_vs_cash_diff: 0,
  },
  {
    year: 2025,
    equity_boy: 6,
    net_income: 14031.63,
    contributions: 47992.77,
    distributions: 58826.59,
    equity_eoy: 3203.81,
    cash_eoy: 3203.81,
    equity_vs_cash_diff: 0,
  },
];

const empty = columns => ({ columns, rows: [] });

/** Route a mocked fetch by URL. `checks` lets a test pick the checks rows. */
const mockApi = ({ checks = [] } = {}) => {
  vi.mocked(fetch).mockImplementation(async url => {
    const u = new URL(url, 'http://localhost');
    const year = u.searchParams.get('year');
    let body;
    if (u.pathname === '/api/books/years') {
      body = [2024, 2025];
    } else if (u.pathname === '/api/books/views/equity_rollforward') {
      body = {
        columns: Object.keys(rollforwardRows[0]),
        rows: year
          ? rollforwardRows.filter(r => String(r.year) === year)
          : rollforwardRows,
      };
    } else if (u.pathname === '/api/books/views/checks') {
      body = {
        columns: ['year', 'check_name', 'problems', 'detail'],
        rows: checks,
      };
    } else if (u.pathname === '/api/books/views/pl_summary') {
      body = {
        columns: [
          'year',
          'income',
          'expenses',
          'payroll',
          'contract_labor',
          'net_income',
        ],
        rows: [
          {
            year: 2025,
            income: 110501.24,
            expenses: 62680.76,
            payroll: 0,
            contract_labor: 33788.85,
            net_income: 14031.63,
          },
        ],
      };
    } else if (u.pathname === '/api/books/views/pl') {
      body = {
        columns: [
          'year',
          'section',
          'line',
          'amount_usd',
          'paid_from_business',
          'paid_from_personal',
          'lines',
        ],
        rows: [
          {
            year: 2025,
            section: 'Income',
            line: 'Revenue (deposits)',
            amount_usd: 110500.12,
            paid_from_business: 110500.12,
            paid_from_personal: null,
            lines: 15,
          },
          {
            year: 2025,
            section: 'Expenses',
            line: 'Travel',
            amount_usd: 19570.88,
            paid_from_business: 1307.64,
            paid_from_personal: 18263.24,
            lines: 587,
          },
        ],
      };
    } else if (u.pathname === '/api/books/views/contributions') {
      body = {
        columns: ['year', 'form', 'account', 'category', 'amount_usd', 'lines'],
        rows: [
          {
            year: 2025,
            form: 'Business expense paid from personal account',
            account: 'usaa',
            category: 'Travel',
            amount_usd: 233.81,
            lines: 3,
          },
        ],
      };
    } else if (u.pathname === '/api/books/views/distributions') {
      body = empty(['year', 'destination', 'account', 'amount_usd', 'lines']);
    } else if (u.pathname === '/api/books/views/balance_sheet') {
      body = {
        columns: [
          'year',
          'assets_cash',
          'liabilities',
          'equity_total',
          'equity_paid_in_capital_cum',
          'equity_distributions_cum',
          'equity_retained_earnings_cum',
          'check_diff',
        ],
        rows: [
          {
            year: 2025,
            assets_cash: 3203.81,
            liabilities: 0,
            equity_total: 3203.81,
            equity_paid_in_capital_cum: 819806.05,
            equity_distributions_cum: 835887.93,
            equity_retained_earnings_cum: 17427.27,
            check_diff: 0,
          },
        ],
      };
    } else if (u.pathname === '/api/books/views/cash_balances') {
      body = {
        columns: ['year', 'account', 'cash_eoy'],
        rows: [{ year: 2025, account: 'UFCU business', cash_eoy: 3203.81 }],
      };
    } else if (u.pathname === '/api/books/views/cash_tie') {
      body = empty([
        'account',
        'year',
        'period_start',
        'period_end',
        'opening_balance',
        'deposits',
        'withdrawals',
        'closing_balance',
        'tie_diff',
        'lines',
        'unexplained_lines',
        'source_file',
      ]);
    } else {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => body };
  });
};

describe('BooksView', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('shows "All checks pass" and the rollforward row for the latest year', async () => {
    mockApi({ checks: [] });
    render(<BooksView />);

    // Checks section is first and green when empty.
    await waitFor(() =>
      expect(screen.getByTestId('checks-pass')).toHaveTextContent(
        'All checks pass'
      )
    );
    const sections = document.querySelectorAll(
      '[data-testid^="books-section-"]'
    );
    expect(sections[0]).toHaveAttribute('data-testid', 'books-section-checks');

    // Rollforward lists every year, selected (latest) year highlighted.
    const table = screen.getByTestId('rollforward-table');
    const rows = within(table).getAllByRole('row').slice(1); // skip header
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('2025');
    expect(rows[1]).toHaveTextContent('3,203.81');
    expect(rows[1]).toHaveTextContent('47,992.77');
    expect(rows[1].className).toContain('bg-accent');
    // Negative money is shown in parentheses.
    expect(rows[0]).toHaveTextContent('(55,553.65)');

    // Other sections rendered from the mocked payloads.
    expect(screen.getByText('Revenue (deposits)')).toBeInTheDocument();
    expect(
      screen.getByText('Balance sheet — Dec 31, 2025')
    ).toBeInTheDocument();

    // CSV / zip links point at the API for the selected year.
    expect(screen.getByTestId('csv-pl')).toHaveAttribute(
      'href',
      '/api/books/views/pl?year=2025&format=csv'
    );
    expect(screen.getByTestId('export-zip')).toHaveTextContent(
      'Export 2025 (zip)'
    );

    // Rollforward was fetched for all years; the rest for the selected year.
    const urls = vi.mocked(fetch).mock.calls.map(c => c[0]);
    expect(urls).toContain('/api/books/views/equity_rollforward');
    expect(urls).toContain('/api/books/views/checks?year=2025');
  });

  it('lists failing checks with their detail', async () => {
    mockApi({
      checks: [
        {
          year: 2025,
          check_name: 'uncategorized business expense rows',
          problems: 4,
          detail: null,
        },
        {
          year: 2025,
          check_name: 'income deposits not matched to an invoice',
          problems: 1,
          detail: '2025-05-02 165.00',
        },
      ],
    });
    render(<BooksView />);

    const list = await screen.findByTestId('checks-list');
    expect(list).toHaveTextContent('uncategorized business expense rows');
    expect(list).toHaveTextContent('4 problems');
    expect(list).toHaveTextContent('2025-05-02 165.00');
    expect(screen.queryByTestId('checks-pass')).not.toBeInTheDocument();
  });
});
