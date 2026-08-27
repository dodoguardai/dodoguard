import { ArrowRight, BriefcaseBusiness, ExternalLink, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import './enterprise-ticker.css';

const ENTERPRISE_BENEFIT_KEYS = [
  'highConcurrency',
  'privateDeployment',
  'teamAccess',
  'dedicatedDelivery',
] as const;

function BenefitList({
  benefits,
  explore,
  hidden = false,
}: {
  benefits: readonly string[];
  explore: string;
  hidden?: boolean;
}) {
  return (
    <div className="enterprise-ticker__items" aria-hidden={hidden || undefined}>
      {benefits.map((benefit) => (
        <span key={benefit} className="enterprise-ticker__item">
          <ShieldCheck size={15} strokeWidth={2} />
          {benefit}
        </span>
      ))}
      <span className="enterprise-ticker__explore">
        <ArrowRight size={15} strokeWidth={2.25} />
        {explore}
      </span>
    </div>
  );
}

/** A compact, continuously scrolling Enterprise capability announcement. */
export function EnterpriseTicker() {
  const { t } = useTranslation();
  const benefits = ENTERPRISE_BENEFIT_KEYS.map((key) => t(`enterpriseTicker.${key}`));
  const explore = t('enterpriseTicker.explore');

  return (
    <aside className="enterprise-ticker" aria-label={t('enterpriseTicker.label')}>
      <div className="enterprise-ticker__label">
        <BriefcaseBusiness size={16} strokeWidth={2} />
        <span>Enterprise</span>
      </div>

      <div className="enterprise-ticker__viewport">
        <div className="enterprise-ticker__track">
          <BenefitList benefits={benefits} explore={explore} />
          <BenefitList benefits={benefits} explore={explore} hidden />
        </div>
      </div>

      <a className="enterprise-ticker__sales" href="mailto:sales@dodoguard.com">
        {t('enterpriseTicker.contactSales')}
        <ExternalLink size={14} strokeWidth={2} />
      </a>
    </aside>
  );
}
