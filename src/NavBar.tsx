import styled from "styled-components";

interface NavBarProps {
  children?: React.ReactNode;
}

const StyledNav = styled.nav`
  display: flex;
  justify-content: space-between;
  background-color: #0C0C0C;
  color: white;
  padding: 10px;
`;

function NavBar({children}: NavBarProps) {

  return (
    <>
      <StyledNav>
        {children}
      </StyledNav>
    </>
  )
}

export default NavBar;
