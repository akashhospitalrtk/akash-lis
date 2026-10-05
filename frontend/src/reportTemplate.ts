import defaults from '../../backend/src/config/reportTemplate.defaults.json';
export type ReportTemplate = Omit<typeof defaults, 'patientLayout' | 'patientLabelWeight' | 'patientValueWeight' | 'dateStyle' | 'headerAlignment' | 'footerAlignment' | 'headerContactAlignment' | 'footerContactAlignment'> & {
  patientLayout: 'three-column' | 'bordered' | 'minimal';
  patientLabelWeight: 'normal' | 'bold'; patientValueWeight: 'normal' | 'bold'; dateStyle: 'date' | 'date-time';
  headerAlignment: 'left' | 'center' | 'right'; footerAlignment: 'left' | 'center' | 'right';
  headerContactAlignment: 'left' | 'center' | 'right'; footerContactAlignment: 'left' | 'center' | 'right';
};
export const defaultReportTemplate = defaults as ReportTemplate;
export type ReportTemplateRecord = { template: ReportTemplate; revision: number };
export function reportDate(value: string | null | undefined, template: ReportTemplate) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric',
    ...(template.dateStyle === 'date-time' ? { hour: '2-digit', minute: '2-digit' } as const : {}), timeZone: 'Asia/Kolkata' }).format(new Date(value)) + (template.dateStyle === 'date-time' ? ' IST' : '');
}
