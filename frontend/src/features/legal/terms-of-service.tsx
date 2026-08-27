import { LegalPageLayout } from './legal-page-layout';

export function TermsOfService() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      description="These terms govern your use of DodoGuard and related services."
      lastUpdated="May 30, 2026"
    >
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">1. Acceptance of Terms</h2>
        <p>
          By accessing or using DodoGuard, you agree to these Terms of Service. If you do not agree,
          do not use the service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">2. Open Source Software</h2>
        <p>
          DodoGuard is provided as open source software under the applicable license included with
          the distribution. Your rights and obligations regarding the software itself are governed by
          that license in addition to these terms where applicable.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">3. Permitted Use</h2>
        <p>
          You may use DodoGuard to evaluate and improve the security of systems you own or are
          explicitly authorized to test. You are responsible for ensuring that all security testing
          activities comply with applicable laws, contracts, and organizational policies.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">4. Prohibited Use</h2>
        <p>
          You must not use DodoGuard to attack, probe, or disrupt systems without authorization,
          violate privacy or intellectual property rights, upload malicious content, or attempt to
          bypass security controls of the service or third parties.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">5. Accounts and Security</h2>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials and for
          all activity under your account. Notify your administrator promptly if you suspect
          unauthorized access.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">6. Disclaimer of Warranties</h2>
        <p>
          DodoGuard is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
          any kind, whether express or implied, including merchantability, fitness for a particular
          purpose, and non-infringement. Security testing results do not guarantee the absence of
          vulnerabilities.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">7. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, the contributors and operators of DodoGuard shall
          not be liable for any indirect, incidental, special, consequential, or punitive damages,
          or for any loss of data, profits, or business arising from your use of the service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">8. Changes to These Terms</h2>
        <p>
          We may update these terms from time to time. Material changes will be reflected by
          updating the date at the top of this page. Continued use after changes constitutes
          acceptance of the revised terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">9. Contact</h2>
        <p>
          If you have questions about these terms, please contact your organization administrator or
          our support channels.
        </p>
      </section>
    </LegalPageLayout>
  );
}
