import { pool, withTransaction } from '../database/pool.js';
import { config } from '../config/env.js';
import { AppError } from '../core/AppError.js';
import { addSystemAudit } from './auditService.js';
import { hasRole } from './permissionService.js';
import { defaultReportTemplate, reportTemplateSchema, saveReportTemplateSchema } from '../schemas/reportTemplateSchema.js';
import type { SessionUser } from '../schemas/authSchemas.js';

export function initialReportTemplate() {
  return { ...defaultReportTemplate, phone: config.hospital.phone || defaultReportTemplate.phone,
    address: config.hospital.address || defaultReportTemplate.address };
}
export async function getReportTemplate() {
  const { rows } = await pool.query('SELECT template, revision FROM report_template WHERE id = 1');
  return { template: reportTemplateSchema.parse({ ...initialReportTemplate(), ...rows[0]?.template }), revision: rows[0]?.revision || 0 };
}
export async function saveReportTemplate(input: unknown, user: SessionUser) {
  if (!hasRole(user, 'ADMIN')) throw AppError.forbidden('Only an administrator can change the report design.');
  const { template, expectedRevision } = saveReportTemplateSchema.parse(input);
  return withTransaction(async client => {
    const { rows } = await client.query('SELECT template, revision FROM report_template WHERE id = 1 FOR UPDATE');
    if (!rows[0]) throw new AppError('Report design storage is not ready. Run the database migration.', 503);
    if (rows[0].revision !== expectedRevision) throw AppError.conflict('Another administrator changed the design. Reload before saving.');
    const revision = expectedRevision + 1;
    await client.query('UPDATE report_template SET template = $1, revision = $2, updated_by = $3, updated_at = NOW() WHERE id = 1', [JSON.stringify(template), revision, user.id]);
    await addSystemAudit(client, user.id, 'REPORT_TEMPLATE_UPDATED', { revision, before: rows[0].template, after: template });
    return { template, revision };
  });
}
