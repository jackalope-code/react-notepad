import styled from "styled-components";

interface NavBarProps {
  children?: React.ReactNode;
}

const StyledNav = styled.nav`
display: flex;
justify-content: space-between;
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
