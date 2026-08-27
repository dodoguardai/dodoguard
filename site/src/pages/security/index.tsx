import React from 'react';
import Layout from '@theme/Layout';
import CallToAction from './components/CallToAction';
import FAQ from './components/FAQ';
import Features from './components/Features';
import Hero from './components/Hero';
import LogoSection from './components/LogoSection';
import Stats from './components/Stats';
import WhyDodoGuard from './components/WhyDodoGuard';
import styles from './styles.module.css';

export default function SecurityLandingPage(): JSX.Element {
  return (
    <Layout
      title="Generative AI Security"
      description="Detect, mitigate, and monitor risks for LLM-based systems before deployment with DodoGuard's comprehensive security solution."
    >
      <main className={styles.securityLandingPage}>
        <Hero />
        <LogoSection />
        <Stats />
        <Features />
        <WhyDodoGuard />
        {/* <Testimonials /> */}
        <FAQ />
        <CallToAction />
      </main>
    </Layout>
  );
}
