import { useRef } from 'react';
import styled from 'styled-components';
import type { StoredDocumentV3 } from './utils/notepadTypes';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear } from '@fortawesome/free-solid-svg-icons';
import ScrollArrows from './ScrollArrows';
import { useIsTouchDevice } from './useIsTouchDevice';
import { useOverflow } from './useOverflow';

interface TabBarProps {
  documents: StoredDocumentV3[];
  activeDocumentId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAddClick: () => void;
  onSettingsClick: (id: string) => void;
}

const TabBarOuter = styled.div`
  display: flex;
  align-items: center;
  background-color: #f0f0f0;
  border-bottom: 1px solid lightslategray;
`;

const TabList = styled.div`
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
  }
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

const SettingsButton = styled.button`
  border: none;
  background: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  line-height: 1;
  padding: 0;
  margin: 0;
  font-size: 0.75rem;
  color: inherit;
`;

const AddButton = styled.button`
  margin-left: 4px;
`;

const ArrowContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  flex: 0 0 auto;
`;

const TAB_SCROLL_STEP = 100;

function TabBar({ documents, activeDocumentId, onSelect, onClose, onAddClick, onSettingsClick }: TabBarProps) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const isTouch = useIsTouchDevice();
  const tabOverflow = useOverflow(tabListRef, [documents]);

  return (
    <TabBarOuter>
      <TabList ref={tabListRef} role="tablist" data-testid="tab-list">
        {documents.map((doc) => (
          <Tab
            key={doc.id}
            role="tab"
            aria-selected={doc.id === activeDocumentId}
            $active={doc.id === activeDocumentId}
            onClick={() => onSelect(doc.id)}
          >
            <span>{doc.title || 'Untitled'}</span>
            {doc.id === activeDocumentId && (
              <SettingsButton
                type="button"
                aria-label={`Settings for ${doc.title || 'Untitled'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSettingsClick(doc.id);
                }}
              >
                <FontAwesomeIcon icon={faGear} />
              </SettingsButton>
            )}
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
      </TabList>
      {isTouch && tabOverflow.hasHorizontalOverflow && (
        <ArrowContainer>
          <ScrollArrows target={tabListRef.current} step={TAB_SCROLL_STEP} />
        </ArrowContainer>
      )}
    </TabBarOuter>
  );
}

export default TabBar;
