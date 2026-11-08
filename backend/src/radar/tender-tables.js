import XLSX from 'xlsx';
import {financialColumns, generalColumns, isUnavailable, technicalColumns} from './seci-columns.js';

const summaryGroups = {
  Technical:[...technicalColumns,['Technical Track Record','technical_track_record_text']],
  Financial:financialColumns,
  General:generalColumns,
};

export function eligibilityEntries(summary, criteria, source) {
  const entries = criteria.map(criterion => {
    const {threshold, unit, period, conditions, evidence, source_url, page, clause, quote} = criterion.reviewed_data ?? criterion;
    return {
      id:criterion.criterion_id, category:criterion.category, requirement:criterion.requirement,
      threshold, unit, period, conditions, evidence, source_url:source_url || source, page, clause, quote,
    };
  });
  for (const [category, columns] of Object.entries(summaryGroups)) {
    for (const [requirement, key] of columns) {
      const value = (key === 'estimated_project_value' && summary?.estimated_project_value_terms) ||
        (key === 'performance_bg_pct' && summary?.performance_bg_terms) || summary?.[key];
      if (!isUnavailable(value)) entries.push({id:key, category, requirement, value, source_url:source});
    }
  }
  return entries;
}

export async function withEligibility(db, tenders) {
  if (!tenders.length) return [];
  const {rows} = await db.query(`SELECT criterion_id,tender_id,category,requirement,reviewed_data
    FROM tender_eligibility_criteria WHERE tender_id=ANY($1::uuid[]) ORDER BY tender_id,category,criterion_id`,
    [tenders.map(tender => tender.id)]);
  const byTender = new Map();
  for (const row of rows) {
    if (!byTender.has(row.tender_id)) byTender.set(row.tender_id, []);
    byTender.get(row.tender_id).push(row);
  }
  return tenders.map(({eligibility_summary, ...tender}) => ({
    ...tender, eligibility_entries:eligibilityEntries(eligibility_summary, byTender.get(tender.id) ?? [], tender.link_to_tender),
  }));
}

export function dashboardWorkbook(tenders) {
  const wb = XLSX.utils.book_new();
  const add = (name, headers, rows) => {
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map(row => row.map(value =>
      isUnavailable(value) ? 'NA' : value instanceof Date ? value.toISOString() : value))]);
    sheet['!cols'] = headers.map(header => ({wch:/Title|Requirement|Conditions|Evidence|Source/.test(header) ? 45 : 23}));
    sheet['!autofilter'] = {ref:sheet['!ref']};
    XLSX.utils.book_append_sheet(wb,sheet,name);
  };
  add('Tenders', ['Tender ID','TN_tenderID','Title','Reference','Authority','Product','Scope','Country','State',
    'Capacity (MW)','Storage Power (MW)','Storage (MWh)','Status','Opening Date','Closing Date','Source URL'],
  tenders.map(t => [t.tender_id,t.id,t.title,t.ref_number,t.authority,t.product,t.scope,t.country,t.state,
    t.total_capacity_mw,t.storage_capacity_mw,t.storage_capacity_mwh,t.current_status,t.tender_open_date,t.tender_close_date,t.link_to_tender]));
  const headers = ['Tender ID','TN_tenderID','Category','Requirement','Value','Threshold','Unit','Period','Conditions','Evidence','Source URL','PDF Page','Clause','Source Excerpt'];
  for (const [name, technical] of [['Technical Eligibility',true], ['Other Eligibility',false]]) {
    add(name,headers,tenders.flatMap(t => t.eligibility_entries.filter(e => (e.category === 'Technical') === technical).map(e =>
      [t.tender_id,t.id,e.category,e.requirement,e.value,e.threshold,e.unit,e.period,e.conditions,e.evidence,e.source_url,e.page,e.clause,e.quote])));
  }
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
