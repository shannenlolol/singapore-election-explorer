import NavBar from "./NavBar.jsx";

export default function Layout({ children }) {
  return <div className="app-shell"><NavBar />{children}</div>;
}
