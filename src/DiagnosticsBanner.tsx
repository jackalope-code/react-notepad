import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { useDiagnostics } from './useDiagnostics';

const Bar = styled.div`
  background: #fef3c7;
  border-bottom: 1px solid #f59e0b;
  padding: 6px 12px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const WarningIcon = styled.span`
  font-size: 1rem;
`;

const DiagLink = styled(Link)`
  margin-left: auto;
  color: #b45309;
  text-decoration: underline;
  font-weight: 600;
  white-space: nowrap;
`;

export default function DiagnosticsBanner() {
  const diag = useDiagnostics();
  if (diag.errors.length === 0) return null;

  return (
    <Bar role="alert">
      <WarningIcon>⚠️</WarningIcon>
      <span>Markdown rendering issue detected — text will display without formatting.</span>
      <DiagLink to="/diagnostics">Diagnostics</DiagLink>
    </Bar>
  );
}
