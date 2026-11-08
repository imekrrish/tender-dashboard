import {format, fields} from './reference-workbook.js';

// Keep the original template's labels and order within each group.
const eligibility = format[1].headers.slice(1).map((header, index) => [
  header,
  fields.Eligibility[index + 1] === '@value' ? 'estimated_project_value' :
    fields.Eligibility[index + 1] === '@pbg' ? 'performance_bg_pct' : fields.Eligibility[index + 1],
]);
export const financialColumns = eligibility.slice(0, 9);
export const legacyTechnicalColumns = eligibility.slice(9);
export const technicalColumns = legacyTechnicalColumns.slice(0, 4);
export const generalColumns = legacyTechnicalColumns.slice(4);
export const otherColumns = [...financialColumns, ...generalColumns];
export const documentHeaders = [...format[2].headers, 'TN_tenderID', 'Review Status', 'Reviewer Remarks'];
export const detailHeaders = columns => ['Tender ID', ...columns.map(([header]) => header), 'TN_tenderID', 'Review Status', 'Reviewer Remarks'];
export const isUnavailable = value => value == null || (typeof value === 'string' && /^(?:N\/?A)?$/i.test(value.trim()));
