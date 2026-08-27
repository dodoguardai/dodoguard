import React from 'react';

import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Layout from '@theme/Layout';

const AboutPageContent = () => {
  const { colorMode } = useColorMode();

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: colorMode === 'dark' ? 'dark' : 'light',
        },
      }),
    [colorMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg">
        <Box py={8}>
          <Typography variant="h2" component="h2" align="center" gutterBottom fontWeight="bold">
            Securing the Future of AI
          </Typography>
          <Typography variant="h5" component="h2" align="center" color="text.secondary" paragraph>
            DodoGuard helps developers and enterprises build secure, reliable AI applications.
          </Typography>
        </Box>

        <Box mb={8}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
                About Us
              </Typography>
              <Typography variant="body1" paragraph>
                We are security and engineering practitioners who have scaled generative AI products
                to hundreds of millions of users. We're building the tools that we wished we had
                when we were on the front lines.
              </Typography>
              <Typography variant="body1" paragraph>
                Based in San Mateo, California, we're backed by Insight Partners, Andreessen
                Horowitz, and top leaders in the technology and security industries.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                <img
                  src="/img/logo-panda.svg"
                  alt="DodoGuard Logo"
                  style={{ maxWidth: '100%', maxHeight: '150px', height: 'auto' }}
                />
              </Box>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        <Box mb={8}>
          <Typography variant="h4" component="h3" align="center" mb={4} fontWeight="medium">
            Our team
          </Typography>
          <Typography variant="body1" align="center" paragraph maxWidth="720px" mx="auto">
            DodoGuard is maintained by engineers and security practitioners focused on practical AI
            evaluation and red teaming. We welcome contributions from the community—see our{' '}
            <Link href="/docs/contributing">contributing guide</Link> or{' '}
            <Link href="https://github.com/dodoguard/dodoguard">GitHub repository</Link>.
          </Typography>
        </Box>

        <Divider sx={{ my: 8 }} />

        <Box mb={8}>
          <Typography variant="h4" component="h3" align="center" fontWeight="medium" mb={4}>
            Open source first
          </Typography>
          <Typography variant="body1" align="center" paragraph mb={4} maxWidth="720px" mx="auto">
            DodoGuard is built in the open so teams can adopt, extend, and audit the tooling they
            rely on for LLM security testing.
          </Typography>
        </Box>

        <Divider sx={{ my: 8 }} />

        <Box mb={8}>
          <Typography variant="h4" component="h3" align="center" gutterBottom fontWeight="medium">
            An Incredible Open Source Community
          </Typography>
          <Typography variant="body1" paragraph align="center">
            DodoGuard is proud to be supported by a vibrant community of over 150 open source
            contributors.
          </Typography>
          <Box display="flex" justifyContent="center" mt={4}>
            <a href="https://github.com/dodoguard/dodoguard/graphs/contributors">
              <img
                src="https://contrib.rocks/image?repo=dodoguard/dodoguard"
                alt="DodoGuard Contributors"
              />
            </a>
          </Box>
        </Box>

        <Box textAlign="center" mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            Ready to Secure Your AI Applications?
          </Typography>
          <Typography variant="body1" paragraph>
            Join leading enterprises who trust DodoGuard to fortify their AI applications.
          </Typography>
          <Link className="button button--primary button--lg" to="/contact/">
            Get in Touch
          </Link>
        </Box>
      </Container>
    </ThemeProvider>
  );
};

const AboutPage = () => {
  return (
    <Layout
      title="About DodoGuard | AI Security Experts"
      description="Learn about DodoGuard's mission to secure AI applications and our team of industry veterans."
    >
      <AboutPageContent />
    </Layout>
  );
};

export default AboutPage;
