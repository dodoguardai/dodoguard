import { LegalPageLayout } from './legal-page-layout';

export function PrivacyPolicy() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      description="This policy describes how we collect, use, and protect your information."
      lastUpdated="May 30, 2026"
    >
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">1. Information We Collect</h2>
        <p>
          We may collect information you provide directly, such as your name, email address, and
          account details, as well as usage data generated when you interact with the service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">2. How We Use Information</h2>
        <p>
          We use collected information to provide and improve the service, authenticate users,
          maintain security, respond to support requests, and comply with legal obligations.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">3. Data Sharing</h2>
        <p>
          We do not sell your personal information. We may share data with trusted service
          providers who assist in operating the platform, or when required by law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">4. Data Security</h2>
        <p>
          We implement reasonable technical and organizational measures to protect your information.
          However, no method of transmission or storage is completely secure.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">5. Data Retention</h2>
        <p>
          We retain personal information only for as long as necessary to fulfill the purposes
          described in this policy, unless a longer retention period is required by law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">6. Your Rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, or restrict
          processing of your personal information. Contact us to exercise these rights where
          applicable.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">7. Cookies and Analytics</h2>
        <p>
          We may use cookies and similar technologies to maintain sessions, remember preferences,
          and understand how the service is used. You can manage cookie settings through your
          browser.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">8. Changes to This Policy</h2>
        <p>
          We may update this privacy policy from time to time. Material changes will be reflected
          by updating the date at the top of this page.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">9. Contact</h2>
        <p>
          If you have questions about this privacy policy or our data practices, please contact us
          through your organization administrator or our support channels.
        </p>
      </section>
    </LegalPageLayout>
  );
}
