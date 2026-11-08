import {Fragment, useState, type ReactNode} from 'react';

export type EligibilityEntry = {
  id: string;
  category: string;
  requirement: string;
  value?: string | number;
  threshold?: string | number;
  unit?: string;
  period?: string;
  conditions?: string;
  evidence?: string;
  source_url?: string;
  page?: number;
  clause?: string;
  quote?: string;
};

export type TenderTableRow = {
  key: string;
  tenderId: string;
  title?: string | null;
  product?: string | null;
  status?: string | null;
  capacity?: string;
  deadline?: string | null;
  source?: string | null;
  eligibility?: EligibilityEntry[];
  selected?: boolean;
  selectionDisabled?: boolean;
  needsDetails?: boolean;
};

const tabs = [
  {key:'tenders', label:'Tenders'},
  {key:'technical', label:'Technical Eligibility'},
  {key:'financial-contractual', label:'Financial & Contractual'},
] as const;

export function SourceLink({url, label = 'Source ↗', page}: {url?: string | null; label?: string; page?: number}) {
  try {
    const source = new URL(url ?? '');
    if (!['https:', 'http:'].includes(source.protocol)) return <>—</>;
    if (page && /\.pdf$/i.test(source.pathname) && !source.hash) source.hash = `page=${page}`;
    return <a className="radar-link" href={source.href} target="_blank" rel="noopener noreferrer">
      {page ? `Page ${page} ↗` : label}
    </a>;
  } catch {
    return <>—</>;
  }
}

export const eligibilityLabels: Record<string,string> = {
  Technical:'Technical Eligibility',
  Financial:'Financial Eligibility',
  General:'Contractual & Consortium Terms',
};

export function eligibilityValue(entry:EligibilityEntry) {
  return entry.value ?? (entry.threshold == null ? null : [entry.threshold,entry.unit].filter(value=>value!=null).join(' '));
}

export function TenderTables({rows, loading, showEligibility = false, empty = 'No tenders to show.', onSelect, renderDetails, download}: {
  rows: TenderTableRow[];
  loading?: boolean;
  showEligibility?: boolean;
  empty?: string;
  onSelect?: (key: string, selected: boolean) => void;
  renderDetails: (key: string) => ReactNode;
  download?: ReactNode;
}) {
  const [tab,setTab] = useState<typeof tabs[number]['key']>('tenders');
  const [expanded,setExpanded] = useState<string>();
  const isTenders = !showEligibility || tab === 'tenders';
  const entries = isTenders ? [] : rows.flatMap(row => (row.eligibility ?? [])
    .filter(entry => tab === 'technical' ? entry.category === 'Technical' : ['Financial','General'].includes(entry.category))
    .map(entry => ({row,entry})));
  const headers = isTenders
    ? [...(onSelect ? ['Import'] : []),'Tender ID','Title','Product','Capacity','Status','Closes','Source','Details']
    : ['Tender ID','Category','Requirement','Value / Threshold','Source'];
  return <div className="radar-tender-tables">
    {(showEligibility || download)&&<div className="radar-tender-toolbar">
      <nav className="radar-catalog-tabs" aria-label="Tender tables">
        {tabs.map(item=><button key={item.key} type="button" className={tab===item.key?'selected':''}
          aria-pressed={tab===item.key} onClick={()=>setTab(item.key)}>{item.label}</button>)}
      </nav>
      {download}
    </div>}
    <div className="radar-table-wrap">
      <table aria-label={tabs.find(item=>item.key===tab)?.label}>
        <thead><tr>{headers.map(header=><th key={header} scope="col">{header}</th>)}</tr></thead>
        <tbody>
          {loading || !(isTenders ? rows.length : entries.length)
            ? <tr><td colSpan={headers.length} className="radar-empty">
              {loading ? 'Loading…' : isTenders ? empty : 'No eligibility recorded for these tenders.'}
            </td></tr>
            : isTenders ? rows.map(row=><Fragment key={row.key}>
              <tr>
                {onSelect&&<td><input type="checkbox" aria-label={`Include ${row.tenderId} in import`}
                  checked={row.selected} disabled={row.selectionDisabled} onChange={event=>onSelect(row.key,event.target.checked)}/></td>}
                <td><strong>{row.tenderId}</strong></td><td>{row.title||'—'}</td><td>{row.product||'—'}</td>
                <td>{row.capacity||'—'}</td><td>{row.status||'—'}</td><td>{row.deadline||'—'}</td><td><SourceLink url={row.source}/></td>
                <td><button type="button" aria-expanded={expanded===row.key} aria-label={`Details for ${row.tenderId}`}
                  onClick={()=>setExpanded(expanded===row.key ? undefined : row.key)}>
                  {expanded===row.key ? 'Hide' : row.needsDetails ? 'Fill details' : 'Expand'}
                </button></td>
              </tr>
              {expanded===row.key&&<tr className="radar-expanded-tender"><td colSpan={headers.length}>{renderDetails(row.key)}</td></tr>}
            </Fragment>) : entries.map(({row,entry})=><tr key={`${row.key}:${entry.id}`}>
              <td><button type="button" onClick={()=>{setExpanded(row.key);setTab('tenders');}}>{row.tenderId}</button></td>
              <td>{eligibilityLabels[entry.category]}</td>
              <td>{entry.requirement}
                {(entry.conditions||entry.evidence||entry.period||entry.clause||entry.quote)&&<details>
                  <summary>More</summary>
                  {entry.period&&<p>Period · {entry.period}</p>}
                  {entry.conditions&&<p>{entry.conditions}</p>}
                  {entry.evidence&&<p>Evidence · {entry.evidence}</p>}
                  {entry.clause&&<p>Clause · {entry.clause}</p>}
                  {entry.quote&&<p>{entry.quote}</p>}
                </details>}
              </td>
              <td>{eligibilityValue(entry) ?? '—'}</td>
              <td><SourceLink url={entry.source_url} page={entry.page}/></td>
            </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

export function tenderCapacity(power: unknown, storage: unknown) {
  return [power == null ? null : `${power} MW`, storage == null ? null : `${storage} MWh`]
    .filter(Boolean).join(' / ');
}
