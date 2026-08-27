import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import CompareIcon from '@mui/icons-material/Compare';
import DescriptionIcon from '@mui/icons-material/Description';
import SecurityIcon from '@mui/icons-material/Security';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import LogoContainer from '@site/src/components/LogoContainer';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

import NewsletterForm from '../components/NewsletterForm';
import { SITE_CONSTANTS } from '../constants';
import '../i18n';
import styles from './index.module.css';

function HomepageHeader({ getStartedUrl }: { getStartedUrl: string }) {
  const { t } = useTranslation();

  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1>
          <span className={styles.heroMainText}>{t('hero.titleMain')}</span>
          <br />
          {t('hero.titleFrom')}{' '}
          <span className={styles.heroHighlight}>{t('hero.titlePrompt')}</span>{' '}
          {t('hero.titleTo')}{' '}
          <span className={styles.heroHighlight}>{t('hero.titleProduction')}</span>
        </h1>
        <p>{t('hero.subtitle', { count: SITE_CONSTANTS.USER_COUNT_DISPLAY })}</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to={getStartedUrl}>
            {t('heroCta.getStarted')}
          </Link>
          <Link
            className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
            to="/contact/"
          >
            {t('heroCta.requestDemo')}
          </Link>
        </div>
      </div>
    </header>
  );
}

function HomepageWalkthrough() {
  const { t } = useTranslation();
  const isDarkTheme = useColorMode().colorMode === 'dark';
  const [selectedStep, setSelectedStep] = React.useState(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#evals') {
        return 5;
      } else if (window.location.hash === '#redteam') {
        return 1;
      } else if (window.location.hash === '#guardrails') {
        return 2;
      } else if (window.location.hash === '#modelsecurity') {
        return 3;
      } else if (window.location.hash === '#mcp') {
        return 4;
      }
    }
    return 1; // Default to Red Teaming
  });
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const steps = [
    {
      id: 1,
      caption: t('walkthrough.redTeaming'),
      mobileCaption: t('walkthrough.redTeamingMobile'),
      image: '/img/riskreport-1.png',
      image2x: '/img/riskreport-1@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>{t('walkthrough.redTeamingHeading')}</p>
          <p>{t('walkthrough.redTeamingIntro')}</p>
          <pre className={styles.codeBox}>
            <code>{t('walkthrough.redTeamingCli')}</code>
          </pre>
          <p>{t('walkthrough.redTeamingDescription')}</p>
          <ul>
            <li>Direct and indirect prompt injections</li>
            <li>Jailbreaks tailored to your guardrails</li>
            <li>Data and PII leaks</li>
            <li>Insecure tool use vulnerabilities</li>
            <li>Unauthorized contract creation</li>
            <li>Toxic content generation</li>
            <li>
              And{' '}
              <Link to="/docs/red-team/llm-vulnerability-types/">
                {t('walkthrough.redTeamingMore')}
              </Link>
            </li>
          </ul>
          <p>
            <strong>
              <Link to="/red-teaming">{t('walkthrough.redTeamingLearnMore')}</Link>
            </strong>
          </p>
        </>
      ),
      icon: <SecurityIcon />,
      destinationUrl: '/red-teaming',
    },
    {
      id: 2,
      caption: t('walkthrough.guardrails'),
      mobileCaption: t('walkthrough.guardrails'),
      image: '/img/guardrails-framed.png',
      image2x: '/img/guardrails-framed.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>{t('walkthrough.guardrailsHeading')}</p>
          <p>{t('walkthrough.guardrailsIntro')}</p>
          <ul>
            <li>Automatically adapts to new attack patterns</li>
            <li>Learns from real-world usage and attack attempts</li>
            <li>Validates both our guardrails and third-party systems</li>
            <li>Enforces company policies with increasing precision</li>
            <li>Protects sensitive information with evolving defenses</li>
          </ul>
          <p>{t('walkthrough.guardrailsDeploy')}</p>
          <p>
            <strong>
              <Link to="/guardrails">{t('walkthrough.guardrailsLearnMore')}</Link>
            </strong>
          </p>
        </>
      ),
      icon: <SecurityIcon />,
      destinationUrl: '/guardrails',
    },
    {
      id: 3,
      caption: t('walkthrough.modelSecurity'),
      mobileCaption: 'Security',
      image: '/img/model-ranking-framed.png',
      image2x: '/img/model-ranking-framed.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>{t('walkthrough.modelSecurityHeading')}</p>
          <p>{t('walkthrough.modelSecurityIntro')}</p>
          <ul>
            <li>OWASP Top 10 for LLMs compliance</li>
            <li>NIST AI Risk Management Framework</li>
            <li>EU AI Act requirements</li>
            <li>Customizable scans for industry regulations</li>
            <li>AWS plugin support for top 10 vulnerabilities</li>
          </ul>
          <p>{t('walkthrough.modelSecurityDescription')}</p>
          <p>
            <strong>
              <Link to="/model-security">{t('walkthrough.modelSecurityLearnMore')}</Link>
            </strong>
          </p>
        </>
      ),
      icon: <DescriptionIcon />,
      destinationUrl: '/model-security',
    },
    {
      id: 4,
      caption: t('walkthrough.mcp'),
      mobileCaption: 'MCP',
      image: '/img/mcp-proxy-dashboard.png',
      image2x: '/img/mcp-proxy-dashboard.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>{t('walkthrough.mcpHeading')}</p>
          <p>{t('walkthrough.mcpIntro')}</p>
          <ul>
            <li>Whitelist approved MCP servers for enterprise use</li>
            <li>Grant access to approved MCP servers to your applications and users</li>
            <li>Real-time monitoring for PII and sensitive data</li>
            <li>Prevent security risks from untrusted MCP servers</li>
          </ul>
          <p>{t('walkthrough.mcpDescription')}</p>
          <p>
            <strong>
              <Link to="/mcp">{t('walkthrough.mcpLearnMore')}</Link>
            </strong>
          </p>
        </>
      ),
      icon: <DescriptionIcon />,
      destinationUrl: '/mcp',
    },
    {
      caption: t('walkthrough.evals'),
      mobileCaption: t('walkthrough.evalsMobile'),
      image: '/img/claude-vs-gpt-example.png',
      image2x: '/img/claude-vs-gpt-example@2x.png',
      imageDark: '/img/claude-vs-gpt-example-dark.png',
      image2xDark: '/img/claude-vs-gpt-example-dark@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>{t('walkthrough.evalsHeading')}</p>
          <p>{t('walkthrough.evalsIntro')}</p>
          <pre className={styles.codeBox}>
            <code>{t('walkthrough.evalsCli')}</code>
          </pre>
          <p>{t('walkthrough.evalsDescription')}</p>
          <p>
            <strong>
              <Link to="/docs/intro/">{t('walkthrough.evalsGetStarted')}</Link>
            </strong>
          </p>
        </>
      ),
      icon: <CompareIcon />,
      destinationUrl: '/docs/intro',
    },
  ];

  const selectedStepData = steps.find((step) => step.id === selectedStep);
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = React.useState(false);

  React.useEffect(() => {
    const checkScroll = () => {
      if (tabsRef.current && isMobile) {
        const { scrollWidth, clientWidth } = tabsRef.current;
        setShowScrollIndicator(scrollWidth > clientWidth);
      }
    };
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [isMobile]);

  return (
    <div className={styles.walkthroughContainer}>
      <div
        className={clsx(styles.walkthroughTabs, showScrollIndicator && styles.scrollable)}
        ref={tabsRef}
      >
        {steps.map((step) => (
          <button
            key={step.id}
            className={clsx(
              styles.walkthroughTab,
              selectedStep === step.id && styles.walkthroughTabActive,
            )}
            onClick={() => setSelectedStep(step.id)}
          >
            {isMobile ? step.mobileCaption : step.caption}
          </button>
        ))}
      </div>
      <div className={styles.walkthroughContent}>
        <div className={styles.walkthroughImageContainer}>
          <Link to={selectedStepData?.destinationUrl || '#'}>
            <img
              src={
                isDarkTheme && selectedStepData?.imageDark
                  ? selectedStepData.imageDark
                  : selectedStepData?.image
              }
              srcSet={
                isDarkTheme && selectedStepData?.image2xDark
                  ? `${selectedStepData.imageDark} 1x, ${selectedStepData.image2xDark} 2x`
                  : `${selectedStepData?.image} 1x, ${selectedStepData?.image2x} 2x`
              }
              alt={`${selectedStepData?.caption}`}
              className={styles.walkthroughImage}
            />
          </Link>
        </div>
        <div className={styles.walkthroughDescription}>
          {steps.find((step) => step.id === selectedStep)?.description}
        </div>
      </div>
    </div>
  );
}

function AsSeenOnSection() {
  const { t } = useTranslation();

  return (
    <section className={styles.asSeenOnSection}>
      <div className="container">
        <h2 className={styles.sectionTitle}>{t('asSeenOn.featuredIn')}</h2>
        <div className={styles.asSeenOnGrid}>
          <a
            href="https://vimeo.com/1023317525/be082a1029"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.asSeenOnCard}
          >
            <div className={styles.asSeenOnContent}>
              <h3>
                <img
                  src="/img/brands/openai-logo.svg"
                  alt="OpenAI"
                  className={styles.asSeenOnLogoInline}
                />
                {t('asSeenOn.buildHours')}
              </h3>
              <p>
                {t('asSeenOn.buildHoursQuote')}
              </p>
              <span className={styles.watchNow}>{t('asSeenOn.buildHoursCta')}</span>
            </div>
          </a>

          <a
            href="https://github.com/anthropics/courses/tree/master/prompt_evaluations"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.asSeenOnCard}
          >
            <div className={styles.asSeenOnContent}>
              <h3>
                <img
                  src="/img/brands/anthropic-logo.svg"
                  alt="Anthropic"
                  className={styles.asSeenOnLogoInline}
                  style={{ maxWidth: 175 }}
                />
                {t('asSeenOn.courses')}
              </h3>
              <p>
                {t('asSeenOn.coursesQuote')}
              </p>
              <span className={styles.watchNow}>{t('asSeenOn.coursesCta')}</span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const [getStartedUrl, setGetStartedUrl] = React.useState('/docs/intro/');

  React.useEffect(() => {
    if (window.location.hash === '#redteam') {
      setGetStartedUrl('/docs/red-team/quickstart/');
    }
  }, []);

  return (
    <Layout
      title="Secure & reliable LLMs"
      description={`Eliminate risk with AI red-teaming and evals used by ${SITE_CONSTANTS.USER_COUNT_DISPLAY}+ developers. Find and fix vulnerabilities, maximize output quality, catch regressions.`}
      wrapperClassName="homepage-wrapper"
    >
      <Head>
        <meta property="og:image" content="https://www.dodoguard.dev/img/meta/homepage.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <HomepageHeader getStartedUrl={getStartedUrl} />
      <div className="container">
        <HomepageWalkthrough />
      </div>
      <main>
        <section className={styles.logoSection}>
          <div className="container">
            <h2>{t('logos.trustedBy')}</h2>
            <LogoContainer noBackground noBorder />
          </div>
        </section>
        <HomepageFeatures />
        <AsSeenOnSection />

        <div className={styles.ctaSection}>
          <h2>{t('cta.title')}</h2>
          <div className={styles.buttons}>
            <Link className="button button--primary button--lg" to={getStartedUrl}>
              {t('cta.getStarted')}
            </Link>
            <Link
              className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
              to="/contact/"
            >
              {t('cta.requestDemo')}
            </Link>
          </div>
        </div>
        <NewsletterForm />
      </main>
    </Layout>
  );
}
