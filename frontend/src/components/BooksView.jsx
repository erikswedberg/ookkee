import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, FileDown, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

// Checks whose name starts with "info:" are advisory: the backend will not
// refuse to close a year over them, but a person should confirm each one.
const isInfo = (r) => /^info:/.test(r.check_name || '');
import {
  BooksContextProvider,
  useBooks,
  viewUrl,
  exportUrl,
  ALL_YEARS,
} from '../contexts/BooksContext';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFormatter = new Intl.NumberFormat('en-US');

/** 1234.5 -> "1,234.50"; -1234.5 -> "(1,234.50)"; null -> "". */
const formatMoney = value => {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (n < 0) return `(${moneyFormatter.format(-n)})`;
  return moneyFormatter.format(n);
};

const formatInt = value => {
  if (value === null || value === undefined || value === '') return '';
  return intFormatter.format(Number(value));
};

const isNonZero = value =>
  value !== null && value !== undefined && Math.abs(Number(value)) > 0.004;

const sum = (rows, key) =>
  rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const cellBase = 'px-2 py-1 align-middle whitespace-nowrap';
const headBase =
  'px-2 py-1 h-8 text-left align-middle font-medium text-muted-foreground text-xs whitespace-nowrap';

/** Right-aligned money cell. `signed` colours negatives red. */
const MoneyCell = ({
  value,
  className = '',
  bold = false,
  alert = false,
  plain = false,
}) => {
  const n = Number(value);
  const negative = !plain && isNonZero(value) && n < 0;
  return (
    <td
      className={`${cellBase} text-right font-mono tabular-nums ${
        bold ? 'font-semibold' : ''
      } ${alert ? 'text-red-600 font-semibold' : negative ? 'text-red-600' : ''} ${className}`}
    >
      {formatMoney(value)}
    </td>
  );
};

/**
 * Generic compact table.
 * columns: [{ key, label, type: 'money'|'int'|'text', alert?: fn(row) -> bool }]
 * If `showYear` is true a Year column is prepended (used in "All years" mode).
 */
const BooksTable = ({
  columns,
  rows,
  showYear = false,
  footer = null,
  rowClassName = () => '',
  emptyText = 'No rows.',
  testId,
}) => {
  const cols = showYear
    ? [{ key: 'year', label: 'Year', type: 'text' }, ...columns]
    : columns;

  if (!rows || rows.length === 0) {
    return <p className="text-sm text-muted-foreground px-2">{emptyText}</p>;
  }

  return (
    <div className="relative w-full overflow-auto">
      <table className="w-full caption-bottom text-sm" data-testid={testId}>
        <thead className="[&_tr]:border-b">
          <tr className="border-b">
            {cols.map(c => (
              <th
                key={c.key}
                className={`${headBase} ${
                  c.type === 'money' || c.type === 'int' ? 'text-right' : ''
                } ${c.headClassName || ''}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.__key ?? i}
              className={`border-b transition-colors hover:bg-muted/50 ${rowClassName(row)}`}
            >
              {cols.map(c => {
                const value = c.render ? c.render(row) : row[c.key];
                if (c.type === 'money') {
                  return (
                    <MoneyCell
                      key={c.key}
                      value={value}
                      alert={c.alert ? c.alert(row) : false}
                      plain={c.plain}
                      className={c.className || ''}
                    />
                  );
                }
                if (c.type === 'int') {
                  return (
                    <td
                      key={c.key}
                      className={`${cellBase} text-right font-mono tabular-nums ${
                        c.alert && c.alert(row)
                          ? 'text-red-600 font-semibold'
                          : ''
                      } ${c.className || ''}`}
                    >
                      {formatInt(value)}
                    </td>
                  );
                }
                return (
                  <td
                    key={c.key}
                    className={`${cellBase} ${c.className || ''}`}
                  >
                    {value ?? ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="border-t font-medium">
            <tr>
              {cols.map((c, i) => {
                const value = footer[c.key];
                if (i === 0 && value === undefined) {
                  return (
                    <td key={c.key} className={`${cellBase} font-semibold`}>
                      {footer.__label ?? 'Total'}
                    </td>
                  );
                }
                if (c.type === 'money') {
                  return <MoneyCell key={c.key} value={value} bold />;
                }
                if (c.type === 'int') {
                  return (
                    <td
                      key={c.key}
                      className={`${cellBase} text-right font-mono tabular-nums font-semibold`}
                    >
                      {formatInt(value)}
                    </td>
                  );
                }
                return (
                  <td key={c.key} className={cellBase}>
                    {value ?? ''}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

/** Download link for a view as CSV. */
const CsvLink = ({ view, year, label = 'CSV' }) => (
  <a
    href={viewUrl(view, year, 'csv')}
    download
    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline"
    title={`Download ${view} as CSV`}
    data-testid={`csv-${view}`}
  >
    <FileDown className="h-3 w-3" />
    {label}
  </a>
);

/** One section of the Books page: title, optional doc, CSV link, body. */
const Section = ({
  id,
  title,
  doc,
  view,
  year,
  children,
  right = null,
  csvLabel = 'CSV',
}) => (
  <Card data-testid={`books-section-${id}`} className="shadow-none">
    <CardHeader className="p-4 pb-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {doc && <p className="text-xs text-muted-foreground mt-1">{doc}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {right}
          {view && <CsvLink view={view} year={year} label={csvLabel} />}
        </div>
      </div>
    </CardHeader>
    <CardContent className="p-4 pt-1">{children}</CardContent>
  </Card>
);

const SubHeading = ({ children }) => (
  <h4 className="font-semibold uppercase text-xs tracking-wide text-muted-foreground mt-3 mb-1 px-2">
    {children}
  </h4>
);

const rowsOf = view => (view && Array.isArray(view.rows) ? view.rows : []);

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const ChecksSection = ({ view, year }) => {
  const rows = rowsOf(view);
  const allYears = year === ALL_YEARS;
  return (
    <Section
      id="checks"
      title="Checks"
      doc="Everything that must be empty before a year goes to the CPA."
      view="checks"
      year={year}
    >
      {rows.length === 0 || rows.every((r) => isInfo(r)) ? (
        <p
          className="flex items-center gap-2 text-sm text-green-600 font-medium px-2"
          data-testid="checks-pass"
        >
          <CheckCircle2 className="h-4 w-4" />
          All checks pass{rows.length > 0 && ' (items below are for your confirmation)'}
        </p>
      ) : null}
      {rows.length > 0 && (
        <ul className="space-y-1 px-2" data-testid="checks-list">
          {rows.map((r, i) => (
            <li
              key={i}
              className={`flex items-start gap-2 text-sm ${isInfo(r) ? 'text-sky-800' : 'text-red-700'}`}
            >
              {isInfo(r) ? (
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <div>
                <span className="font-medium">
                  {allYears && `${r.year}: `}
                  {isInfo(r) ? r.check_name.replace(/^info:\s*/, '') : r.check_name}
                </span>
                <span className="text-muted-foreground">
                  {' '}
                  — {formatInt(r.problems)}{' '}
                  {isInfo(r) ? (Number(r.problems) === 1 ? 'item' : 'items') : Number(r.problems) === 1 ? 'problem' : 'problems'}
                </span>
                {r.detail && (
                  <div className="text-xs text-muted-foreground font-mono break-words whitespace-pre-wrap">
                    {r.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};

const ROLLFORWARD_COLUMNS = [
  { key: 'year', label: 'Year', type: 'text' },
  { key: 'equity_boy', label: 'Equity BOY', type: 'money' },
  { key: 'net_income', label: 'Net income', type: 'money' },
  { key: 'contributions', label: 'Contributions', type: 'money' },
  { key: 'distributions', label: 'Distributions', type: 'money' },
  { key: 'equity_eoy', label: 'Equity EOY', type: 'money' },
  { key: 'cash_eoy', label: 'Cash EOY', type: 'money' },
  {
    key: 'equity_vs_cash_diff',
    label: 'Equity vs cash',
    type: 'money',
    alert: r => isNonZero(r.equity_vs_cash_diff),
  },
];

const RollforwardSection = ({ view, year }) => {
  const rows = rowsOf(view);
  return (
    <Section
      id="rollforward"
      title="Equity rollforward"
      doc="Equity EOY = Equity BOY + net income + contributions − distributions, checked against year-end cash. All years shown; the selected year is highlighted."
      view="equity_rollforward"
      year={ALL_YEARS}
    >
      <BooksTable
        testId="rollforward-table"
        columns={ROLLFORWARD_COLUMNS}
        rows={rows.map(r => ({ ...r, __key: r.year }))}
        rowClassName={r =>
          year !== ALL_YEARS && Number(r.year) === Number(year)
            ? 'bg-accent font-medium'
            : ''
        }
      />
    </Section>
  );
};

const PL_SECTION_ORDER = ['Income', 'Payroll', 'Contract labor', 'Expenses'];

const PL_COLUMNS = [
  { key: 'line', label: 'Line', type: 'text', className: 'pl-6' },
  {
    key: 'amount_usd',
    label: 'Amount (USD)',
    type: 'money',
    headClassName: 'w-40',
  },
  {
    key: 'paid_from_business',
    label: 'Paid from business',
    type: 'money',
    headClassName: 'w-40',
  },
  {
    key: 'paid_from_personal',
    label: 'Paid from personal',
    type: 'money',
    headClassName: 'w-40',
  },
  { key: 'lines', label: 'Lines', type: 'int', headClassName: 'w-20' },
];

const PL_SUMMARY_COLUMNS = [
  { key: 'income', label: 'Income', type: 'money' },
  { key: 'expenses', label: 'Expenses', type: 'money' },
  { key: 'payroll', label: 'Payroll', type: 'money' },
  { key: 'contract_labor', label: 'Contract labor', type: 'money' },
  {
    key: 'net_income',
    label: 'Net income',
    type: 'money',
    className: 'font-semibold',
  },
];

const groupBy = (rows, key) => {
  const map = new Map();
  rows.forEach(r => {
    const k = r[key] ?? '';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return map;
};

const PLSection = ({ summary, detail, year }) => {
  const summaryRows = rowsOf(summary);
  const detailRows = rowsOf(detail);
  const allYears = year === ALL_YEARS;

  const sections = useMemo(() => {
    const grouped = groupBy(detailRows, 'section');
    const ordered = [
      ...PL_SECTION_ORDER.filter(s => grouped.has(s)),
      ...[...grouped.keys()].filter(s => !PL_SECTION_ORDER.includes(s)),
    ];
    return ordered.map(name => ({ name, rows: grouped.get(name) }));
  }, [detailRows]);

  return (
    <Section
      id="pl"
      title="P&L"
      doc="Cash basis, USD. Summary line first, then the detail by section and category, split by which account paid."
      view="pl"
      year={year}
      csvLabel="Detail CSV"
      right={<CsvLink view="pl_summary" year={year} label="Summary CSV" />}
    >
      <BooksTable
        testId="pl-summary-table"
        columns={PL_SUMMARY_COLUMNS}
        rows={summaryRows.map(r => ({ ...r, __key: r.year }))}
        showYear={allYears}
        emptyText="No P&L summary for this year."
      />
      {sections.map(({ name, rows }) => (
        <div key={name}>
          <SubHeading>{name}</SubHeading>
          <BooksTable
            columns={PL_COLUMNS}
            rows={rows}
            showYear={allYears}
            footer={{
              __label: `${name} total`,
              amount_usd: sum(rows, 'amount_usd'),
              paid_from_business: sum(rows, 'paid_from_business'),
              paid_from_personal: sum(rows, 'paid_from_personal'),
              lines: sum(rows, 'lines'),
            }}
          />
        </div>
      ))}
      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground px-2 mt-2">
          No P&L lines for this year.
        </p>
      )}
    </Section>
  );
};

const PERSONAL_FORM = 'Business expense paid from personal account';

/** Pivot: one row per category, one money column per account, plus total. */
const AccountByCategoryTable = ({ rows, showYear }) => {
  const accounts = useMemo(
    () =>
      [...new Set(rows.map(r => r.account ?? ''))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [rows]
  );

  const pivot = useMemo(() => {
    // key = (year,) category
    const map = new Map();
    rows.forEach(r => {
      const k = showYear ? `${r.year}|${r.category ?? ''}` : (r.category ?? '');
      if (!map.has(k)) {
        map.set(k, {
          __key: k,
          year: r.year,
          category: r.category ?? '(none)',
          total: 0,
          lines: 0,
        });
      }
      const p = map.get(k);
      p[`acct:${r.account ?? ''}`] =
        (p[`acct:${r.account ?? ''}`] || 0) + (Number(r.amount_usd) || 0);
      p.total += Number(r.amount_usd) || 0;
      p.lines += Number(r.lines) || 0;
    });
    return [...map.values()].sort(
      (a, b) => (showYear ? a.year - b.year : 0) || b.total - a.total
    );
  }, [rows, showYear]);

  const columns = [
    { key: 'category', label: 'Category', type: 'text', className: 'pl-6' },
    ...accounts.map(a => ({ key: `acct:${a}`, label: a, type: 'money' })),
    { key: 'total', label: 'Total', type: 'money', className: 'font-semibold' },
    { key: 'lines', label: 'Lines', type: 'int' },
  ];

  const footer = { __label: 'Total', lines: sum(pivot, 'lines'), total: 0 };
  accounts.forEach(a => {
    footer[`acct:${a}`] = sum(pivot, `acct:${a}`);
    footer.total += footer[`acct:${a}`];
  });

  return (
    <BooksTable
      columns={columns}
      rows={pivot}
      showYear={showYear}
      footer={footer}
    />
  );
};

const ContributionsSection = ({ view, year }) => {
  const rows = rowsOf(view);
  const allYears = year === ALL_YEARS;
  const forms = useMemo(() => {
    const grouped = groupBy(rows, 'form');
    // Cash in first, then the personal-account form, then anything else.
    const keys = [...grouped.keys()].sort((a, b) => {
      const rank = k => (k === PERSONAL_FORM ? 1 : 0);
      return rank(a) - rank(b) || a.localeCompare(b);
    });
    return keys.map(k => ({ form: k, rows: grouped.get(k) }));
  }, [rows]);

  return (
    <Section
      id="contributions"
      title="Contributions"
      doc="Owner cash transferred into the business account, and business expenses paid from personal accounts."
      view="contributions"
      year={year}
      right={
        <span className="text-xs text-muted-foreground font-mono">
          Total {formatMoney(sum(rows, 'amount_usd'))}
        </span>
      }
    >
      {forms.length === 0 && (
        <p className="text-sm text-muted-foreground px-2">
          No contributions for this year.
        </p>
      )}
      {forms.map(({ form, rows: formRows }) => (
        <div key={form}>
          <SubHeading>{form}</SubHeading>
          {form === PERSONAL_FORM ? (
            <AccountByCategoryTable rows={formRows} showYear={allYears} />
          ) : (
            <BooksTable
              columns={[
                {
                  key: 'account',
                  label: 'Account',
                  type: 'text',
                  className: 'pl-6',
                },
                { key: 'amount_usd', label: 'Amount (USD)', type: 'money' },
                { key: 'lines', label: 'Lines', type: 'int' },
              ]}
              rows={formRows}
              showYear={allYears}
              footer={{
                __label: 'Total',
                amount_usd: sum(formRows, 'amount_usd'),
                lines: sum(formRows, 'lines'),
              }}
            />
          )}
        </div>
      ))}
    </Section>
  );
};

const DistributionsSection = ({ view, year }) => {
  const rows = rowsOf(view);
  const allYears = year === ALL_YEARS;
  return (
    <Section
      id="distributions"
      title="Distributions"
      doc="Business cash to the owner by destination; includes personal spending charged to the business account."
      view="distributions"
      year={year}
    >
      <BooksTable
        columns={[
          { key: 'destination', label: 'Destination', type: 'text' },
          { key: 'account', label: 'From account', type: 'text' },
          { key: 'amount_usd', label: 'Amount (USD)', type: 'money' },
          { key: 'lines', label: 'Lines', type: 'int' },
        ]}
        rows={rows}
        showYear={allYears}
        emptyText="No distributions for this year."
        footer={{
          __label: 'Total',
          amount_usd: sum(rows, 'amount_usd'),
          lines: sum(rows, 'lines'),
        }}
      />
    </Section>
  );
};

const BALANCE_LINES = [
  { key: 'assets_cash', label: 'Cash', group: 'Assets' },
  { key: 'liabilities', label: 'Liabilities', group: 'Liabilities' },
  {
    key: 'equity_paid_in_capital_cum',
    label: 'Paid-in capital (cumulative)',
    group: 'Equity',
  },
  {
    key: 'equity_distributions_cum',
    label: 'Distributions (cumulative)',
    group: 'Equity',
    negate: true,
  },
  {
    key: 'equity_retained_earnings_cum',
    label: 'Retained earnings (cumulative)',
    group: 'Equity',
  },
  { key: 'equity_total', label: 'Total equity', group: 'Equity', bold: true },
];

const GroupRows = ({ group, bs, cashRows }) => (
  <>
    <tr className="bg-muted/50 border-b">
      <td
        className={`${cellBase} font-semibold uppercase text-xs tracking-wide text-muted-foreground`}
        colSpan={2}
      >
        {group}
      </td>
    </tr>
    {group === 'Assets' &&
      cashRows.map(r => (
        <tr
          key={`${r.year}-${r.account}`}
          className="border-b text-muted-foreground"
        >
          <td className={`${cellBase} pl-10 text-xs`}>{r.account}</td>
          <MoneyCell value={r.cash_eoy} className="text-xs" />
        </tr>
      ))}
    {BALANCE_LINES.filter(l => l.group === group).map(l => (
      <tr key={l.key} className={`border-b ${l.bold ? 'font-semibold' : ''}`}>
        <td className={`${cellBase} pl-6`}>{l.label}</td>
        <MoneyCell
          value={l.negate ? -Number(bs[l.key] || 0) : bs[l.key]}
          bold={l.bold}
        />
      </tr>
    ))}
  </>
);

const BalanceSheetSection = ({ view, cashBalances, year }) => {
  const rows = rowsOf(view);
  const cashRows = rowsOf(cashBalances);
  const allYears = year === ALL_YEARS;

  if (allYears) {
    return (
      <Section
        id="balance-sheet"
        title="Balance sheet"
        doc="Year-end cash, liabilities (none), equity and its cumulative components."
        view="balance_sheet"
        year={year}
      >
        <BooksTable
          columns={[
            { key: 'assets_cash', label: 'Cash', type: 'money' },
            { key: 'liabilities', label: 'Liabilities', type: 'money' },
            {
              key: 'equity_paid_in_capital_cum',
              label: 'Paid-in capital',
              type: 'money',
            },
            {
              key: 'equity_distributions_cum',
              label: 'Distributions',
              type: 'money',
            },
            {
              key: 'equity_retained_earnings_cum',
              label: 'Retained earnings',
              type: 'money',
            },
            { key: 'equity_total', label: 'Total equity', type: 'money' },
            {
              key: 'check_diff',
              label: 'Check',
              type: 'money',
              alert: r => isNonZero(r.check_diff),
            },
          ]}
          rows={rows.map(r => ({ ...r, __key: r.year }))}
          showYear
        />
        <SubHeading>Year-end cash by account</SubHeading>
        <BooksTable
          columns={[
            {
              key: 'account',
              label: 'Account',
              type: 'text',
              className: 'pl-6',
            },
            { key: 'cash_eoy', label: 'Cash EOY', type: 'money' },
          ]}
          rows={cashRows}
          showYear
        />
      </Section>
    );
  }

  const bs = rows[0];
  return (
    <Section
      id="balance-sheet"
      title={`Balance sheet${bs ? ` — Dec 31, ${bs.year}` : ''}`}
      doc="Year-end cash, liabilities (none), equity and its cumulative components."
      view="balance_sheet"
      year={year}
    >
      {!bs ? (
        <p className="text-sm text-muted-foreground px-2">
          No balance sheet for this year.
        </p>
      ) : (
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm max-w-xl">
            <tbody>
              {['Assets', 'Liabilities', 'Equity'].map(group => (
                <GroupRows
                  key={group}
                  group={group}
                  bs={bs}
                  cashRows={cashRows}
                />
              ))}
              <tr className="border-t-2 border-black">
                <td className={`${cellBase} font-semibold`}>
                  Check (assets − liabilities − equity)
                </td>
                <MoneyCell
                  value={bs.check_diff}
                  bold
                  alert={isNonZero(bs.check_diff)}
                />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
};

const CASH_TIE_COLUMNS = [
  { key: 'account', label: 'Account', type: 'text' },
  { key: 'period_start', label: 'From', type: 'text' },
  { key: 'period_end', label: 'To', type: 'text' },
  { key: 'opening_balance', label: 'Opening', type: 'money' },
  { key: 'deposits', label: 'Deposits', type: 'money' },
  { key: 'withdrawals', label: 'Withdrawals', type: 'money', plain: true },
  { key: 'closing_balance', label: 'Closing', type: 'money' },
  {
    key: 'tie_diff',
    label: 'Tie diff',
    type: 'money',
    alert: r => isNonZero(r.tie_diff),
  },
  { key: 'lines', label: 'Lines', type: 'int' },
  {
    key: 'unexplained_lines',
    label: 'Unexplained',
    type: 'int',
    alert: r => Number(r.unexplained_lines) > 0,
  },
  {
    key: 'source_file',
    label: 'Statement',
    type: 'text',
    className: 'text-xs text-muted-foreground',
  },
];

const CashTieSection = ({ view, year }) => {
  const rows = rowsOf(view);
  const bad = rows.filter(
    r => isNonZero(r.tie_diff) || Number(r.unexplained_lines) > 0
  ).length;
  return (
    <Section
      id="cash-tie"
      title="Cash tie"
      doc="Per statement: opening + lines = closing, and every line explained."
      view="cash_tie"
      year={year}
      right={
        <span
          className={`text-xs font-medium ${bad > 0 ? 'text-red-600' : 'text-green-600'}`}
        >
          {rows.length} {rows.length === 1 ? 'statement' : 'statements'}
          {bad > 0 ? `, ${bad} with issues` : ', all tie'}
        </span>
      }
    >
      <BooksTable
        columns={CASH_TIE_COLUMNS}
        rows={rows}
        showYear={year === ALL_YEARS}
        emptyText="No statements for this year."
        rowClassName={r =>
          isNonZero(r.tie_diff) || Number(r.unexplained_lines) > 0
            ? 'bg-red-50'
            : ''
        }
      />
    </Section>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const YearSelector = ({ years, year, onChange }) => (
  <Tabs
    value={year === ALL_YEARS ? 'all' : String(year)}
    onValueChange={v => onChange(v === 'all' ? ALL_YEARS : Number(v))}
    className="w-auto"
  >
    <TabsList data-testid="books-year-tabs">
      {years.map(y => (
        <TabsTrigger key={y} value={String(y)} data-testid={`year-${y}`}>
          {y}
        </TabsTrigger>
      ))}
      <TabsTrigger value="all" data-testid="year-all">
        All years
      </TabsTrigger>
    </TabsList>
  </Tabs>
);

const BooksPage = () => {
  const {
    years,
    year,
    setYear,
    views,
    viewsYear,
    rollforward,
    loading,
    error,
  } = useBooks();
  const allYears = year === ALL_YEARS;
  // Sections render against the year their data was fetched for, so a stale
  // all-years payload is never drawn with single-year layout (or vice versa).
  const dataYear = viewsYear;

  return (
    <Card className="h-[calc(100vh-50px)] overflow-hidden rounded-none border-0 shadow-none flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Books</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cash-basis books per year: checks, equity rollforward, P&amp;L,
              contributions, distributions, balance sheet, cash tie.
              {loading && ' • Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {years.length > 0 && (
              <YearSelector years={years} year={year} onChange={setYear} />
            )}
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              onClick={() => {
                window.location.href = exportUrl(year);
              }}
              data-testid="export-zip"
              title={
                allYears
                  ? 'Export every view for all years as a zip of CSVs'
                  : `Export every view for ${year} as a zip of CSVs`
              }
            >
              <Download className="h-4 w-4" />
              {allYears ? 'Export all years (zip)' : `Export ${year} (zip)`}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto px-6 pb-6 pt-0">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {!error && years.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            No books yet: no statement years found.
          </p>
        )}
        <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {views.checks && (
            <ChecksSection view={views.checks} year={dataYear} />
          )}
          {rollforward && <RollforwardSection view={rollforward} year={year} />}
          {views.pl_summary && views.pl && (
            <PLSection
              summary={views.pl_summary}
              detail={views.pl}
              year={dataYear}
            />
          )}
          {views.contributions && (
            <ContributionsSection view={views.contributions} year={dataYear} />
          )}
          {views.distributions && (
            <DistributionsSection view={views.distributions} year={dataYear} />
          )}
          {views.balance_sheet && (
            <BalanceSheetSection
              view={views.balance_sheet}
              cashBalances={views.cash_balances}
              year={dataYear}
            />
          )}
          {views.cash_tie && (
            <CashTieSection view={views.cash_tie} year={dataYear} />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const BooksView = () => (
  <BooksContextProvider>
    <BooksPage />
  </BooksContextProvider>
);

export default BooksView;
