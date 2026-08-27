import React, { useEffect } from 'react';
import Layout from '@theme/Layout';
import styles from './careers.module.css';

export default function Careers(): JSX.Element {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://jobs.ashbyhq.com/dodoguard/embed';
    script.async = true;

    document.body.appendChild(script);
  }, []);

  return (
    <Layout title="Careers at DodoGuard" description="Shape the future of LLM Security">
      <h1 className={styles.careersTitle}>Careers at DodoGuard</h1>
      <div id="ashby_embed" />
    </Layout>
  );
}
