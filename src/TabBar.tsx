import styled from 'styled-components';
import type { StoredDocumentV3 } from './utils/notepadTypes';

interface TabBarProps {
  documents: StoredDocumentV3[];
  activeDocumentId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAddClick: () => void;
}

const TabBarContainer = styled.div`
  display: flex;
  align-items: center;
  background-color: #f0f0f0;
  border-bottom: 1px solid lightslategray;
  overflow-x: auto;
`;

const Tab = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  border-right: 1px solid lightslategray;
  background-color: ${(props) => (props.$active ? 'white' : 'transparent')};
  font-weight: ${(props) => (props.$active ? 600 : 400)};
  white-space: nowrap;
`;

const CloseButton = styled.button`
  border: none;
  background: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  line-height: 1;
  padding: 0;
  margin: 0;
  font-size: 0.8rem;
`;

const AddButton = styled.button`
  margin-left: 4px;
`;

function TabBar({ documents, activeDocumentId, onSelect, onClose, onAddClick }: TabBarProps) {
  return (
    <TabBarContainer role="tablist">
      {documents.map((doc) => (
        <Tab
          key={doc.id}
          role="tab"
          aria-selected={doc.id === activeDocumentId}
          $active={doc.id === activeDocumentId}
          onClick={() => onSelect(doc.id)}
        >
          <span>{doc.title || 'Untitled'}</span>
          {documents.length > 1 && (
            <CloseButton
              type="button"
              aria-label={`Close ${doc.title || 'Untitled'}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(doc.id);
              }}
            >
              &times;
            </CloseButton>
          )}
        </Tab>
      ))}
      <AddButton type="button" aria-label="New document" onClick={onAddClick}>
        +
      </AddButton>
    </TabBarContainer>
  );
}

export default TabBar;
