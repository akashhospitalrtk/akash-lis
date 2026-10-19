// Explicit maintenance command: npm build, then node dist/src/scripts/applyCleanReportDesign.js REVISION.
// Preserves hospital identity, report wording and labels; records before/after appearance in the audit log.
import { pool, withTransaction } from '../database/pool.js';
import { initialReportTemplate } from '../services/reportTemplateService.js';
import { defaultReportTemplate, reportTemplateSchema } from '../schemas/reportTemplateSchema.js';
import { addSystemAudit } from '../services/auditService.js';

const revisionText = process.argv[2];
if (!revisionText || !/^\d+$/.test(revisionText)) throw new Error('Supply the current report design revision.');
const expectedRevision = Number(revisionText);
const appearanceKeys = [
  'bandColor', 'bandTextColor', 'helplineColor', 'footerBandColor', 'footerBandTextColor', 'footerTextColor',
  'headerAlignment', 'footerAlignment', 'headerContactAlignment', 'footerContactAlignment', 'headerGapMm', 'footerGapMm',
  'brandFontPt', 'subtitleFontPt', 'contactFontPt', 'footerFontPt', 'disclaimerFontPt', 'helplineFontPt',
  'headerHeightMm', 'footerHeightMm', 'bodyFontPt', 'watermarkOpacity', 'patientLayout',
  'patientLabelWeight', 'patientValueWeight', 'showBadge'
] as const;

try {
  const revision = await withTransaction(async client => {
    const { rows } = await client.query('SELECT template, revision FROM report_template WHERE id=1 FOR UPDATE');
    if (!rows[0] || rows[0].revision !== expectedRevision) throw new Error('Report design changed. Read the current revision before applying.');
    const before = reportTemplateSchema.parse({ ...initialReportTemplate(), ...rows[0].template });
    const appearance = Object.fromEntries(appearanceKeys.map(key => [key, defaultReportTemplate[key]]));
    const after = reportTemplateSchema.parse({ ...before, ...appearance });
    const revision = expectedRevision + 1;
    await client.query('UPDATE report_template SET template=$1, revision=$2, updated_by=NULL, updated_at=now() WHERE id=1', [JSON.stringify(after), revision]);
    await addSystemAudit(client, null, 'REPORT_TEMPLATE_UPDATED', { source: 'maintenance:clean-hospital-design', revision, before, after });
    return revision;
  });
  console.log(JSON.stringify({ reportAppearance: 'clean-hospital', revision, identityAndWordingPreserved: true }));
} finally { await pool.end(); }
