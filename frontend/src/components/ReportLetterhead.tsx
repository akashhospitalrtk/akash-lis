import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { ReportTemplate } from '../reportTemplate';

export function templateStyle(template: ReportTemplate): CSSProperties {
  return { '--letterhead-band': template.bandColor, '--letterhead-ink': template.bandTextColor,
    '--letterhead-helpline': template.helplineColor, '--letterhead-top': `${template.headerHeightMm}mm`,
    '--letterhead-bottom': `${template.footerHeightMm}mm`, '--report-font': `${template.bodyFontPt}pt`,
    '--footer-band': template.footerBandColor, '--footer-ink': template.footerBandTextColor, '--footer-copy': template.footerTextColor,
    '--header-align': template.headerAlignment, '--footer-align': template.footerAlignment,
    '--header-contact-align': template.headerContactAlignment, '--footer-contact-align': template.footerContactAlignment,
    '--header-gap': `${template.headerGapMm}mm`, '--footer-gap': `${template.footerGapMm}mm`,
    '--watermark-opacity': template.watermarkOpacity } as CSSProperties;
}
function FittedText({ value, size, className = '' }: { value: string; size: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const content = box.firstElementChild as HTMLElement;
    function fit() {
      if (!box || !box.clientWidth || !box.clientHeight) return;
      let font = size;
      content.style.fontSize = `${font}pt`;
      while (font > 5 && (content.scrollHeight > box.clientHeight + 1 || content.scrollWidth > box.clientWidth + 1)) {
        font -= .25; content.style.fontSize = `${font}pt`;
      }
    }
    fit(); const observer = new ResizeObserver(fit); observer.observe(box);
    window.addEventListener('beforeprint', fit);
    return () => { observer.disconnect(); window.removeEventListener('beforeprint', fit); };
  }, [value, size]);
  return <div ref={ref} className={`letterhead-fit ${className}`}><div style={{ fontSize: `${size}pt` }}>{(className === 'letterhead-phone' || className === 'letterhead-address') && <svg className="letterhead-contact-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">{className === 'letterhead-phone' ? <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 1.9z" /> : <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" /><circle cx="12" cy="10" r="2.5" /></>}</svg>}{value}</div></div>;
}
export function LetterheadHeader({ template: t }: { template: ReportTemplate }) {
  return <header className="letterhead-header">
    <img className="letterhead-emblem" src="/letterhead/emblem.svg" alt="" />
    <div className="letterhead-brand"><FittedText className="letterhead-name" value={t.brandName} size={t.brandFontPt} /><FittedText className="letterhead-subtitle" value={t.subtitle} size={t.subtitleFontPt} /></div>
    <div className="letterhead-contact"><FittedText className="letterhead-phone" value={t.phone} size={t.contactFontPt + 3} /><FittedText className="letterhead-address" value={t.address} size={t.contactFontPt} /><FittedText className="letterhead-location" value={t.locationLine} size={t.contactFontPt + 3.5} /></div>
  </header>;
}
export function LetterheadFooter({ template: t }: { template: ReportTemplate }) {
  return <footer className="letterhead-footer"><div className="letterhead-services"><div className="letterhead-copy"><FittedText value={`• ${t.supportLine}`} size={t.footerFontPt} /><FittedText value={t.servicesLine} size={t.footerFontPt} /><FittedText value={t.facilitiesLine} size={t.footerFontPt} /></div><FittedText className="letterhead-helpline" value={`Helpline No.\n${t.phone}`} size={t.helplineFontPt} />{t.showBadge && <img className="letterhead-badge" src="/letterhead/beti-bachao.svg" alt="Beti Bachao Beti Padhao" />}</div><div className="letterhead-terms"><FittedText value={t.disclaimerLines.filter(Boolean).map(line => `• ${line}`).join('\n')} size={t.disclaimerFontPt} /></div></footer>;
}
