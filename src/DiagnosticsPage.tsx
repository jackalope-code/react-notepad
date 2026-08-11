import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useDiagnostics } from './useDiagnostics';
import { clearErrors } from './diagnostics';

const Container = styled.div`
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
  font-family: system-ui, sans-serif;
`;

const BackButton = styled.button`
  background: white;
  border: 1px solid lightslategray;
  border-radius: 4px;
  padding: 6px 16px;
  margin-bottom: 16px;
  cursor: pointer;
`;

const Section = styled.section`
  margin-bottom: 24px;
`;

const SectionTitle = styled.h2`
  font-size: 1.1rem;
  margin-bottom: 8px;
`;

const FeatureRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid #eee;
`;

const Status = styled.span<{ $ok: boolean }>`
  color: ${(p) => (p.$ok ? '#16a34a' : '#dc2626')};
  font-weight: 600;
`;

const ErrorList = styled.ul`
  list-style: none;
  padding: 0;
`;

const ErrorItem = styled.li`
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 8px;
  font-family: monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-word;
`;

const ClearButton = styled.button`
  background: white;
  border: 1px solid lightslategray;
  border-radius: 4px;
  padding: 4px 12px;
  margin-top: 8px;
  cursor: pointer;
`;

const Explanation = styled.p`
  color: #555;
  font-size: 0.9rem;
  line-height: 1.5;
`;

export default function DiagnosticsPage() {
  const diag = useDiagnostics();
  const navigate = useNavigate();

  const hasUnsupportedFeatures =
    !diag.features.arrayAt ||
    !diag.features.regExpLookbehind ||
    !diag.features.unicodePropEscapes;

  return (
    <Container>
      <BackButton onClick={() => navigate('/')}>← Back</BackButton>
      <h1>Diagnostics</h1>

      <Section>
        <SectionTitle>Browser Feature Support</SectionTitle>
        <FeatureRow>
          <span>Array.prototype.at()</span>
          <Status $ok={diag.features.arrayAt}>
            {diag.features.arrayAt ? 'Supported' : 'Missing (polyfilled)'}
          </Status>
        </FeatureRow>
        <FeatureRow>
          <span>RegExp lookbehind (?&lt;=…)</span>
          <Status $ok={diag.features.regExpLookbehind}>
            {diag.features.regExpLookbehind ? 'Supported' : 'Not supported'}
          </Status>
        </FeatureRow>
        <FeatureRow>
          <span>Unicode property escapes (\p{'{P}'})</span>
          <Status $ok={diag.features.unicodePropEscapes}>
            {diag.features.unicodePropEscapes ? 'Supported' : 'Not supported'}
          </Status>
        </FeatureRow>
        {hasUnsupportedFeatures && (
          <Explanation>
            The markdown rendering library (marked@18) requires these features.
            Missing features cause markdown formatting to fail silently — text
            will still be editable but won't show headers, bold, bullets, etc.
          </Explanation>
        )}
      </Section>

      <Section>
        <SectionTitle>Recorded Errors ({diag.errors.length})</SectionTitle>
        {diag.errors.length === 0 ? (
          <p>No errors recorded.</p>
        ) : (
          <>
            <ErrorList>
              {diag.errors.map((err, i) => (
                <ErrorItem key={i}>
                  {new Date(err.timestamp).toLocaleTimeString()}: {err.message}
                </ErrorItem>
              ))}
            </ErrorList>
            <ClearButton onClick={clearErrors}>Clear errors</ClearButton>
          </>
        )}
      </Section>
    </Container>
  );
}
