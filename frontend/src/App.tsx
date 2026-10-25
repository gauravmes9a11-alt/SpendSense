import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";
import Recurring from "./pages/Recurring";
import Subscriptions from "./pages/Subscriptions";
import Analytics from "./pages/Analytics";
import Anomalies from "./pages/Anomalies";
import Explorer from "./pages/Explorer";
import SettingsPage from "./pages/Settings";
import { EmptyState } from "./components/ui";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/anomalies" element={<Anomalies />} />
        <Route path="/explorer" element={<Explorer />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<EmptyState title="Page not found" body="Use the sidebar to open a SpendSense page." />} />
      </Routes>
    </Layout>
  );
}
