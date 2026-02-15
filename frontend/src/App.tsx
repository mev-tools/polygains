import { useEffect, useState } from "react";
import { MainV2Page } from "./pages/MainV2Page";
import { TerminalPage } from "./pages/TerminalPage";
import "./index.css";

export function App() {
	const [path, setPath] = useState(window.location.pathname);

	useEffect(() => {
		const handleLocationChange = () => {
			setPath(window.location.pathname);
		};
		window.addEventListener("popstate", handleLocationChange);
		// Also listen for pushState/replaceState if needed, but for simple navigation it's often enough
		// unless we are doing internal links.
		return () => window.removeEventListener("popstate", handleLocationChange);
	}, []);

	if (path === "/mainv2") {
		return <MainV2Page />;
	}

	return <TerminalPage />;
}

export default App;
