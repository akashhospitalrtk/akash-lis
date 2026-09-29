import type { CSSProperties } from 'react';
import type { ReportTemplate } from '../reportTemplate';

export function templateStyle(template: ReportTemplate): CSSProperties {
  return { '--letterhead-band': template.bandColor, '--letterhead-ink': template.bandTextColor,
    '--letterhead-helpline': template.helplineColor, '--letterhead-top': `${template.headerHeightMm}mm`,
    '--letterhead-bottom': `${template.footerHeightMm}mm`, '--report-font': `${template.bodyFontPt}pt`,
    '--watermark-opacity': template.watermarkOpacity } as CSSProperties;
}
export function LetterheadHeader({ template: t }: { template: ReportTemplate }) {
  return <header className="letterhead-header">
    <img className="letterhead-emblem" src="/letterhead/emblem.svg" alt="" />
    <div className="letterhead-brand"><div className="letterhead-name" style={{ fontSize: `${Math.min(92, 350 / Math.max(t.brandName.length * .72, 1))}px` }}>{t.brandName}</div><div className="letterhead-subtitle">{t.subtitle}</div></div>
    <div className="letterhead-contact"><p className="letterhead-phone"><span aria-hidden="true">☎</span> {t.phone}</p><p className="letterhead-address"><span aria-hidden="true">●</span><span>{t.address}</span></p><p className="letterhead-location">{t.locationLine}</p></div>
  </header>;
}
export function LetterheadFooter({ template: t }: { template: ReportTemplate }) {
  return <footer className="letterhead-footer"><div className="letterhead-services"><div className="letterhead-copy"><p>• {t.supportLine}</p><p>{t.servicesLine}</p><p>{t.facilitiesLine}</p></div><div className="letterhead-helpline">Helpline No.<br />{t.phone}</div>{t.showBadge && <img className="letterhead-badge" src="/letterhead/beti-bachao.svg" alt="Beti Bachao Beti Padhao" />}</div><div className="letterhead-terms">{t.disclaimerLines.map((line, index) => <p key={index}>{line && '• '}{line}</p>)}</div></footer>;
}
